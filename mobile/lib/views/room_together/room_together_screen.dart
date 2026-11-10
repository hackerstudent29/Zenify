import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/dynamic_island_header.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/zen_button.dart';
import '../../design_system/zen.dart';
import '../../models/track.dart';
import '../../services/dock_visibility.dart';
import '../../services/innertube_service.dart';
import '../../services/player_state.dart';
import '../../services/together_service.dart';

class RoomTogetherScreen extends StatefulWidget {
  const RoomTogetherScreen({super.key});

  @override
  State<RoomTogetherScreen> createState() => _RoomTogetherScreenState();
}

class _FloatingEmoji {
  _FloatingEmoji(this.emoji, this.left)
      : id = DateTime.now().microsecondsSinceEpoch,
        opacity = 1.0,
        bottom = 120.0;
  final int id;
  final String emoji;
  final double left;
  double bottom;
  double opacity;
}

class _RoomTogetherScreenState extends State<RoomTogetherScreen>
    with SingleTickerProviderStateMixin, HideDocksMixin {
  // Lobby State
  String _selectedMode = 'dj'; // 'dj' or 'collab'
  final TextEditingController _joinCodeController = TextEditingController();
  final TextEditingController _nameController = TextEditingController(text: 'Guest Listener');
  bool _isBusy = false;

  // Live Room Tabs: 0: Queue, 1: Chat, 2: People, 3: Info
  int _activeTab = 0;
  final TextEditingController _chatController = TextEditingController();
  final ScrollController _chatScrollController = ScrollController();
  int _lastChatCount = 0;

  // Real-Time Floating Reactions Overlay
  final List<_FloatingEmoji> _activeEmojis = [];
  Timer? _emojiTimer;
  Map<String, int> _lastReactionCounts = {};

  static const List<String> _reactionEmojis = ['❤️', '🔥', '👏', '😭', '💃', '🎧'];

  @override
  void initState() {
    super.initState();
    _emojiTimer = Timer.periodic(const Duration(milliseconds: 32), (_) => _tickEmojis());
  }

  @override
  void dispose() {
    _emojiTimer?.cancel();
    _chatController.dispose();
    _chatScrollController.dispose();
    _joinCodeController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _spawnEmoji(String emoji) {
    if (!mounted) return;
    final rng = math.Random();
    final leftPos = 40.0 + rng.nextDouble() * (MediaQuery.of(context).size.width - 100.0);
    setState(() {
      _activeEmojis.add(_FloatingEmoji(emoji, leftPos));
    });
  }

  void _triggerReaction(TogetherService together, String emoji) {
    HapticFeedback.lightImpact();
    _spawnEmoji(emoji);
    together.sendReaction(emoji);
  }

  void _tickEmojis() {
    if (_activeEmojis.isEmpty) return;
    setState(() {
      for (final e in _activeEmojis) {
        e.bottom += 4.5;
        e.opacity -= 0.022;
      }
      _activeEmojis.removeWhere((e) => e.opacity <= 0.05 || e.bottom > 620);
    });
  }

  void _sendMessage(TogetherService together) {
    final text = _chatController.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.selectionClick();
    together.sendChat(text);
    _chatController.clear();
  }

  void _copyRoomCode(String code) {
    Clipboard.setData(ClipboardData(text: code));
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Room code $code copied to clipboard!'),
        backgroundColor: const Color(0xFF18181B),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  void _showLeaveDialog(TogetherService together) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF18181B),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
        ),
        title: const Text(
          'Leave Session?',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18),
        ),
        content: const Text(
          'You will be disconnected from the synchronized playback room.',
          style: TextStyle(color: Colors.white70, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('CANCEL', style: TextStyle(color: Colors.white60, fontSize: 12)),
          ),
          ZenButton(
            label: 'LEAVE',
            compact: true,
            accentColor: Zen.rose,
            onTap: () {
              Navigator.of(ctx).pop();
              together.leaveRoom();
            },
          ),
        ],
      ),
    );
  }

  void _openAddTrackSheet(BuildContext context, TogetherService together) {
    final userQueuedCount = together.queue.where((i) => i.addedByUserId == together.myUserId).length;
    if (userQueuedCount >= 3 && !together.isHost) {
      HapticFeedback.heavyImpact();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Fair Queue Cap: You have 3 active songs in queue. Let others take a turn!'),
          backgroundColor: Color(0xFF18181B),
          behavior: SnackBarBehavior.floating,
        ),
      );
      return;
    }

    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _AddTrackModalSheet(together: together),
    );
  }

  @override
  Widget build(BuildContext context) {
    final together = context.watch<TogetherService>();
    final player = context.watch<PlayerState>();

    // Detect incoming peer reactions to trigger floating animations
    final currentReactions = together.reactions;
    for (final entry in currentReactions.entries) {
      final prev = _lastReactionCounts[entry.key] ?? 0;
      if (entry.value > prev) {
        final delta = math.min(3, entry.value - prev);
        for (int i = 0; i < delta; i++) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            _spawnEmoji(entry.key);
          });
        }
      }
    }
    _lastReactionCounts = Map.from(currentReactions);

    // Auto-scroll chat when new messages arrive
    if (together.chat.length > _lastChatCount) {
      _lastChatCount = together.chat.length;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_chatScrollController.hasClients) {
          _chatScrollController.animateTo(
            _chatScrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
          );
        }
      });
    }

    final topInset = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: Zen.bg,
      body: Stack(
        children: [
          CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              // Top Clearance for Floating Header
              SliverToBoxAdapter(child: SizedBox(height: topInset + 56)),

              if (!together.inRoom)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _buildLobbyView(together),
                )
              else ...[
                // Room Code & Sync Status Banner
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                    child: _buildRoomCodeBanner(together),
                  ),
                ),

                // Host & Mode Strip
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                    child: _buildHostStrip(together),
                  ),
                ),

                // Now Playing Shared Card
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: _buildNowPlayingRoomCard(together, player),
                  ),
                ),

                // 4 Segmented Tabs: Queue, Chat, People, Info
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: _buildSegmentedTabs(together),
                  ),
                ),

                // Tab Content View
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                    child: _buildActiveTabContent(together, player),
                  ),
                ),

                // Bottom padding to clear reaction bar & safe area
                SliverToBoxAdapter(
                  child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 180),
                ),
              ],
            ],
          ),

          // Floating Animated Reaction Emojis
          ..._activeEmojis.map((e) {
            return Positioned(
              left: e.left,
              bottom: e.bottom,
              child: Opacity(
                opacity: e.opacity.clamp(0.0, 1.0),
                child: Text(e.emoji, style: const TextStyle(fontSize: 34)),
              ),
            );
          }),

          // Persistent Floating Reaction Bar (when in room)
          if (together.inRoom)
            Positioned(
              left: 20,
              right: 20,
              bottom: MediaQuery.paddingOf(context).bottom + 24,
              child: _buildReactionBar(together),
            ),

          // Persistent Floating Dynamic Island Header
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DynamicIslandHeader(
              title: 'Room Together',
              showBack: true,
              onBack: () => Navigator.of(context).pop(),
              topPadding: topInset + 4,
              trailing: together.inRoom
                  ? PressableScale(
                      scale: 0.88,
                      onTap: () => _copyRoomCode(together.roomCode),
                      child: AppleGlass(
                        borderRadius: BorderRadius.circular(22),
                        tint: const Color(0x26121216),
                        child: const SizedBox(
                          width: 44,
                          height: 44,
                          child: Center(
                            child: Icon(Icons.share_rounded, color: Colors.white, size: 20),
                          ),
                        ),
                      ),
                    )
                  : null,
            ),
          ),
        ],
      ),
    );
  }

  // ────────────────────────── LOBBY VIEW ──────────────────────────

  Widget _buildLobbyView(TogetherService together) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: Zen.rose.withValues(alpha: 0.15),
              shape: BoxShape.circle,
              border: Border.all(color: Zen.rose.withValues(alpha: 0.35), width: 1.5),
              boxShadow: [
                BoxShadow(
                  color: Zen.rose.withValues(alpha: 0.25),
                  blurRadius: 28,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Icon(Icons.spatial_audio_rounded, color: Zen.rose, size: 40),
          ),
          const SizedBox(height: 20),
          const Text(
            'Room Together',
            style: TextStyle(
              color: Colors.white,
              fontSize: 26,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Listen to pristine 160 kbps Opus audio in sub-millisecond sync with friends. Shared queue, live reactions & drift guard.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Zen.textMuted, fontSize: 13, height: 1.45),
          ),
          const SizedBox(height: 28),

          // Session Mode Selector
          Row(
            children: [
              Expanded(
                child: _buildModeChip(
                  label: 'DJ SESSION',
                  sub: 'Host Controls Playback',
                  icon: Icons.headphones_rounded,
                  selected: _selectedMode == 'dj',
                  onTap: () => setState(() => _selectedMode = 'dj'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _buildModeChip(
                  label: 'JAM SESSION',
                  sub: 'Everyone Controls Playback',
                  icon: Icons.bolt_rounded,
                  selected: _selectedMode == 'collab',
                  onTap: () => setState(() => _selectedMode = 'collab'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Display Name Input
          Container(
            height: 48,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: const Color(0xFF141416),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
            ),
            alignment: Alignment.center,
            child: TextField(
              controller: _nameController,
              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
              decoration: const InputDecoration(
                hintText: 'YOUR DISPLAY NAME',
                hintStyle: TextStyle(color: Colors.white38, fontSize: 11, letterSpacing: 1.2),
                border: InputBorder.none,
                isDense: true,
                icon: Icon(Icons.person_outline_rounded, color: Colors.white54, size: 18),
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Create Room Button
          ZenButton(
            label: _isBusy ? 'CREATING SESSION...' : 'CREATE NEW ROOM',
            width: double.infinity,
            disabled: _isBusy,
            icon: Icons.add_circle_outline_rounded,
            onTap: () async {
              HapticFeedback.mediumImpact();
              setState(() => _isBusy = true);
              final ok = await together.createRoom(
                mode: _selectedMode,
                guestName: _nameController.text.trim().isNotEmpty ? _nameController.text.trim() : null,
              );
              if (mounted) {
                setState(() => _isBusy = false);
                if (!ok) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Could not create room. Please verify backend connection.'),
                      backgroundColor: Color(0xFF18181B),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
              }
            },
          ),
          const SizedBox(height: 24),

          // Divider with text
          Row(
            children: [
              Expanded(child: Container(height: 1, color: Colors.white.withValues(alpha: 0.1))),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: Text(
                  'OR JOIN WITH 6-DIGIT CODE',
                  style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.4),
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.5,
                  ),
                ),
              ),
              Expanded(child: Container(height: 1, color: Colors.white.withValues(alpha: 0.1))),
            ],
          ),
          const SizedBox(height: 20),

          // Join by Code Input & Button
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 48,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    color: const Color(0xFF141416),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
                  ),
                  alignment: Alignment.center,
                  child: TextField(
                    controller: _joinCodeController,
                    textCapitalization: TextCapitalization.characters,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 2.0,
                    ),
                    decoration: const InputDecoration(
                      hintText: 'ENTER CODE (e.g. ZEN-4829)',
                      hintStyle: TextStyle(
                        color: Colors.white30,
                        fontSize: 10,
                        letterSpacing: 1.2,
                        fontWeight: FontWeight.w600,
                      ),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              ZenButton(
                label: 'JOIN',
                disabled: _isBusy,
                onTap: () async {
                  final code = _joinCodeController.text.trim();
                  if (code.isEmpty) return;
                  HapticFeedback.mediumImpact();
                  setState(() => _isBusy = true);
                  final ok = await together.joinRoom(
                    code,
                    guestName: _nameController.text.trim().isNotEmpty ? _nameController.text.trim() : null,
                  );
                  if (mounted) {
                    setState(() => _isBusy = false);
                    if (!ok) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Could not join room "$code". Verify code and try again.'),
                          backgroundColor: const Color(0xFF18181B),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    }
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: 24),

          // Tech badge info
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.shield_outlined, color: Colors.white.withValues(alpha: 0.4), size: 14),
              const SizedBox(width: 6),
              Text(
                'Zero API Keys · Decentralized Stream Resolution · Anti-Drift Guard',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.4), fontSize: 10, fontWeight: FontWeight.w500),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildModeChip({
    required String label,
    required String sub,
    required IconData icon,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return PressableScale(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? Zen.rose.withValues(alpha: 0.15) : const Color(0xFF141416),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? Zen.rose.withValues(alpha: 0.5) : Colors.white.withValues(alpha: 0.08),
            width: selected ? 1.5 : 1.0,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: selected ? Zen.rose : Colors.white60, size: 16),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    label,
                    style: TextStyle(
                      color: selected ? Colors.white : Colors.white70,
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.0,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              sub,
              style: TextStyle(color: selected ? Colors.white70 : Colors.white38, fontSize: 9),
            ),
          ],
        ),
      ),
    );
  }

  // ────────────────────────── LIVE ROOM BANNER & STRIP ──────────────────────────

  Widget _buildRoomCodeBanner(TogetherService together) {
    Color syncDotColor;
    String syncLabel;

    switch (together.syncHealth) {
      case SyncHealth.connected:
        syncDotColor = const Color(0xFF10B981);
        syncLabel = together.pingMs > 0 ? 'Synced · ${together.pingMs}ms' : 'Synced';
        break;
      case SyncHealth.syncing:
        syncDotColor = const Color(0xFFF59E0B);
        syncLabel = 'Syncing...';
        break;
      case SyncHealth.outOfSync:
        syncDotColor = const Color(0xFFEF4444);
        syncLabel = 'Catching up';
        break;
      case SyncHealth.disconnected:
        syncDotColor = Colors.white38;
        syncLabel = 'Offline';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // Room Code + Live Indicator
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Color(0xFF10B981),
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'LIVE',
                style: TextStyle(
                  color: Color(0xFF10B981),
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.2,
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: () => _copyRoomCode(together.roomCode),
                child: Row(
                  children: [
                    Text(
                      together.roomCode,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Icon(Icons.copy_rounded, color: Colors.white38, size: 13),
                  ],
                ),
              ),
            ],
          ),

          // Sync Health Pill
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: syncDotColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: syncDotColor.withValues(alpha: 0.3)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 6,
                  height: 6,
                  decoration: BoxDecoration(color: syncDotColor, shape: BoxShape.circle),
                ),
                const SizedBox(width: 6),
                Text(
                  syncLabel,
                  style: TextStyle(color: syncDotColor, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.8),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHostStrip(TogetherService together) {
    final hostMember = together.members.firstWhere(
      (m) => m.isHost,
      orElse: () => TogetherMember(userId: '', username: 'Host', role: 'host'),
    );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF141416),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.06)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(Icons.stars_rounded, color: Color(0xFFFBBF24), size: 16),
              const SizedBox(width: 6),
              Text(
                together.isHost ? 'You are Host' : 'Host: ${hostMember.username}',
                style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  together.mode == 'collab' ? 'JAM MODE' : 'DJ MODE',
                  style: TextStyle(
                    color: Zen.rose,
                    fontSize: 8,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.0,
                  ),
                ),
              ),
            ],
          ),
          Text(
            '👥 ${together.memberCount} Listening',
            style: TextStyle(color: Zen.textMuted, fontSize: 11, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }

  // ────────────────────────── NOW PLAYING SHARED CARD ──────────────────────────

  Widget _buildNowPlayingRoomCard(TogetherService together, PlayerState player) {
    final current = together.currentTrack ?? player.currentTrack;
    final isPlaying = together.isPlaying;

    // Time calculations
    final positionSec = player.livePosition.inMilliseconds / 1000.0;
    final totalSec = current?.durationSeconds ?? 210;
    final clampedPos = positionSec.clamp(0.0, totalSec.toDouble());
    final progress = totalSec > 0 ? (clampedPos / totalSec).clamp(0.0, 1.0) : 0.0;

    final elapsedStr = _formatDuration(Duration(seconds: clampedPos.toInt()));
    final totalStr = _formatDuration(Duration(seconds: totalSec));

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.4),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        children: [
          Row(
            children: [
              // Cover Artwork
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  width: 64,
                  height: 64,
                  color: const Color(0xFF27272A),
                  child: current?.coverUrl.isNotEmpty == true
                      ? Image.network(
                          current!.coverUrl,
                          fit: BoxFit.cover,
                          errorBuilder: (_, _, _) => const Icon(Icons.music_note, color: Colors.white54),
                        )
                      : const Icon(Icons.music_note, color: Colors.white54, size: 28),
                ),
              ),
              const SizedBox(width: 14),

              // Title, Artist & Dedication
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      current?.title ?? 'No Track Playing',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.2,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      current?.artist ?? 'Select a song to start session',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(color: Zen.textMuted, fontSize: 12),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF10B981).withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: const Text(
                            '160 KBPS OPUS',
                            style: TextStyle(
                              color: Color(0xFF10B981),
                              fontSize: 8,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.8,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          'Decentralized Audio',
                          style: TextStyle(color: Zen.textMuted, fontSize: 10),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              // Play / Pause Button
              IconButton(
                icon: Icon(
                  isPlaying ? Icons.pause_circle_filled_rounded : Icons.play_circle_filled_rounded,
                  color: Zen.rose,
                  size: 44,
                ),
                onPressed: () {
                  HapticFeedback.selectionClick();
                  if (together.isHost || together.mode == 'collab') {
                    if (isPlaying) {
                      together.hostPause(clampedPos);
                    } else if (current != null) {
                      together.hostPlay(current, clampedPos);
                    }
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Host controls playback in DJ mode. You can vote to skip below!'),
                        duration: Duration(seconds: 2),
                      ),
                    );
                  }
                },
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Shared Progress Scrubber
          Column(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 4,
                  backgroundColor: Colors.white.withValues(alpha: 0.08),
                  valueColor: AlwaysStoppedAnimation<Color>(Zen.rose),
                ),
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(elapsedStr, style: TextStyle(color: Zen.textMuted, fontSize: 10, fontWeight: FontWeight.w600)),
                  Text(totalStr, style: TextStyle(color: Zen.textMuted, fontSize: 10, fontWeight: FontWeight.w600)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Action Pills: Leave Sync & Skip Vote
          Row(
            children: [
              // Leave Sync / Rejoin Live Toggle
              Expanded(
                child: PressableScale(
                  onTap: () {
                    HapticFeedback.mediumImpact();
                    together.toggleLeaveSync();
                  },
                  child: Container(
                    height: 36,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    decoration: BoxDecoration(
                      color: together.leaveSync ? Zen.rose.withValues(alpha: 0.20) : Colors.white.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: together.leaveSync ? Zen.rose.withValues(alpha: 0.6) : Colors.white.withValues(alpha: 0.1),
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          together.leaveSync ? Icons.sync_problem_rounded : Icons.sync_rounded,
                          color: together.leaveSync ? Zen.rose : const Color(0xFF10B981),
                          size: 14,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          together.leaveSync ? 'REJOIN LIVE ⚡' : 'SYNC: LIVE',
                          style: TextStyle(
                            color: together.leaveSync ? Zen.rose : Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.0,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),

              // Skip Vote Button
              Expanded(
                child: PressableScale(
                  onTap: () {
                    HapticFeedback.mediumImpact();
                    if (together.isHost || together.mode == 'collab') {
                      together.hostSkipNext();
                    } else {
                      together.voteSkip();
                    }
                  },
                  child: Container(
                    height: 36,
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    decoration: BoxDecoration(
                      color: together.hasVotedSkip ? Zen.rose.withValues(alpha: 0.25) : Colors.white.withValues(alpha: 0.06),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                        color: together.hasVotedSkip ? Zen.rose : Colors.white.withValues(alpha: 0.1),
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.skip_next_rounded, color: together.hasVotedSkip ? Zen.rose : Colors.white70, size: 15),
                        const SizedBox(width: 6),
                        Text(
                          together.isHost
                              ? 'SKIP NEXT'
                              : 'VOTE SKIP (${together.skipVotes.length}/${together.skipVotesNeeded})',
                          style: TextStyle(
                            color: together.hasVotedSkip ? Zen.rose : Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.0,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ────────────────────────── SEGMENTED TABS ──────────────────────────

  Widget _buildSegmentedTabs(TogetherService together) {
    final tabs = [
      'QUEUE (${together.queue.length})',
      'CHAT (${together.chat.length})',
      'PEOPLE (${together.memberCount})',
      'INFO',
    ];

    return Container(
      height: 38,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: const Color(0xFF141416),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Row(
        children: List.generate(tabs.length, (i) {
          final selected = _activeTab == i;
          return Expanded(
            child: GestureDetector(
              onTap: () {
                HapticFeedback.selectionClick();
                setState(() => _activeTab = i);
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: selected ? Colors.white.withValues(alpha: 0.12) : Colors.transparent,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text(
                  tabs[i],
                  style: TextStyle(
                    color: selected ? Colors.white : Zen.textMuted,
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.0,
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildActiveTabContent(TogetherService together, PlayerState player) {
    switch (_activeTab) {
      case 0:
        return _buildQueueTab(together);
      case 1:
        return _buildChatTab(together);
      case 2:
        return _buildPeopleTab(together);
      case 3:
      default:
        return _buildInfoTab(together);
    }
  }

  // ────────────────────────── TAB 0: QUEUE ──────────────────────────

  Widget _buildQueueTab(TogetherService together) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'SHARED QUEUE',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.6),
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
              PressableScale(
                onTap: () => _openAddTrackSheet(context, together),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: Zen.rose.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Zen.rose.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.add_rounded, color: Zen.rose, size: 14),
                      const SizedBox(width: 4),
                      Text(
                        'ADD SONG',
                        style: TextStyle(color: Zen.rose, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 1.0),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          if (together.queue.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Column(
                  children: [
                    Icon(Icons.queue_music_rounded, color: Colors.white24, size: 36),
                    const SizedBox(height: 8),
                    Text('Shared queue is empty', style: TextStyle(color: Zen.textMuted, fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text('Tap "Add Song" to search and add tracks for everyone.', style: TextStyle(color: Colors.white38, fontSize: 11)),
                  ],
                ),
              ),
            )
          else
            ...together.queue.asMap().entries.map((entry) {
              final idx = entry.key;
              final item = entry.value;
              final canRemove = together.isHost || item.addedByUserId == together.myUserId;

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.05)),
                ),
                child: Row(
                  children: [
                    Text(
                      '#${idx + 1}',
                      style: TextStyle(color: Zen.textMuted, fontSize: 11, fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(width: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Container(
                        width: 40,
                        height: 40,
                        color: const Color(0xFF27272A),
                        child: item.track.coverUrl.isNotEmpty
                            ? Image.network(item.track.coverUrl, fit: BoxFit.cover, errorBuilder: (_, _, _) => const Icon(Icons.music_note, color: Colors.white38, size: 20))
                            : const Icon(Icons.music_note, color: Colors.white38, size: 20),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            item.track.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
                          ),
                          const SizedBox(height: 2),
                          Row(
                            children: [
                              Flexible(
                                child: Text(
                                  item.track.artist,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: Zen.textMuted, fontSize: 11),
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text('•', style: TextStyle(color: Zen.textMuted, fontSize: 10)),
                              const SizedBox(width: 6),
                              Text(
                                'by ${item.addedByName}',
                                style: TextStyle(color: Zen.rose.withValues(alpha: 0.8), fontSize: 10, fontWeight: FontWeight.w600),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    if (canRemove)
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: Colors.white38, size: 18),
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          together.removeFromQueue(item.id);
                        },
                      ),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  // ────────────────────────── TAB 1: CHAT ──────────────────────────

  Widget _buildChatTab(TogetherService together) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'REAL-TIME CHAT',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.6),
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 12),

          if (together.chat.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(
                child: Text('Say hi to everyone in the room! 👋', style: TextStyle(color: Zen.textMuted, fontSize: 13)),
              ),
            )
          else
            SizedBox(
              height: 240,
              child: ListView.builder(
                controller: _chatScrollController,
                physics: const BouncingScrollPhysics(),
                itemCount: together.chat.length,
                itemBuilder: (context, index) {
                  final m = together.chat[index];
                  final isMe = m.userId == together.myUserId;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
                    child: Container(
                      constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      decoration: BoxDecoration(
                        color: isMe ? Zen.rose.withValues(alpha: 0.22) : Colors.white.withValues(alpha: 0.08),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: isMe ? Zen.rose.withValues(alpha: 0.35) : Colors.white.withValues(alpha: 0.06),
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                isMe ? 'You' : m.username,
                                style: TextStyle(
                                  color: isMe ? Zen.rose : Colors.white70,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                _formatTimestamp(m.timestamp),
                                style: TextStyle(color: Colors.white30, fontSize: 8),
                              ),
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(m.text, style: const TextStyle(color: Colors.white, fontSize: 13, height: 1.3)),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          const SizedBox(height: 10),

          // Message Input Field
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 42,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                  ),
                  alignment: Alignment.center,
                  child: TextField(
                    controller: _chatController,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: const InputDecoration(
                      hintText: 'Type a message to room...',
                      hintStyle: TextStyle(color: Colors.white38, fontSize: 12),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                    onSubmitted: (_) => _sendMessage(together),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ZenButton(
                label: 'SEND',
                compact: true,
                onTap: () => _sendMessage(together),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ────────────────────────── TAB 2: PEOPLE ──────────────────────────

  Widget _buildPeopleTab(TogetherService together) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'CONNECTED LISTENERS',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.6),
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
              ),
              Text(
                '${together.memberCount} ONLINE',
                style: const TextStyle(
                  color: Color(0xFF10B981),
                  fontSize: 10,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.0,
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),

          ...together.members.map((m) {
            final isMe = m.userId == together.myUserId;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: isMe ? Zen.rose.withValues(alpha: 0.08) : Colors.white.withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isMe ? Zen.rose.withValues(alpha: 0.25) : Colors.white.withValues(alpha: 0.05),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: m.isHost ? const Color(0xFFFBBF24).withValues(alpha: 0.2) : Colors.white.withValues(alpha: 0.1),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: m.isHost ? const Color(0xFFFBBF24).withValues(alpha: 0.6) : Colors.white24,
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      m.username.isNotEmpty ? m.username[0].toUpperCase() : '?',
                      style: TextStyle(
                        color: m.isHost ? const Color(0xFFFBBF24) : Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              m.username + (isMe ? ' (You)' : ''),
                              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
                            ),
                            if (m.isHost) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.stars_rounded, color: Color(0xFFFBBF24), size: 14),
                            ],
                          ],
                        ),
                        Text(
                          m.isHost ? 'Host · DJ' : 'Listener',
                          style: TextStyle(color: Zen.textMuted, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  if (m.lastPing > 0)
                    Text('${m.lastPing}ms', style: TextStyle(color: Zen.textMuted, fontSize: 11)),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  // ────────────────────────── TAB 3: INFO ──────────────────────────

  Widget _buildInfoTab(TogetherService together) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'SESSION INFORMATION',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.6),
              fontSize: 10,
              fontWeight: FontWeight.w800,
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 14),

          // Room Code Card
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.04),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('INVITE CODE', style: TextStyle(color: Zen.textMuted, fontSize: 9, fontWeight: FontWeight.w800)),
                    const SizedBox(height: 4),
                    Text(
                      together.roomCode,
                      style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900, letterSpacing: 2.0),
                    ),
                  ],
                ),
                ZenButton(
                  label: 'COPY',
                  compact: true,
                  icon: Icons.copy_rounded,
                  onTap: () => _copyRoomCode(together.roomCode),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // Tech Specs
          _buildSpecRow('Audio Stream', 'Decentralized 160 kbps Opus (on-device)'),
          _buildSpecRow('Sync Engine', 'NTP Clock Alignment · 1.5s Barrier Window'),
          _buildSpecRow('Drift Protection', 'Sub-audible Pitch Nudging (1.02x / 0.98x)'),
          _buildSpecRow('Fair Queue', 'Democratic 3-Track Cap per Listener'),
          const SizedBox(height: 20),

          // Leave Room Button
          ZenButton(
            label: 'LEAVE SESSION',
            width: double.infinity,
            icon: Icons.logout_rounded,
            accentColor: Colors.white70,
            onTap: () => _showLeaveDialog(together),
          ),
        ],
      ),
    );
  }

  Widget _buildSpecRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: TextStyle(color: Zen.textMuted, fontSize: 11, fontWeight: FontWeight.w600)),
          ),
          Expanded(
            child: Text(value, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }

  // ────────────────────────── FLOATING REACTION BAR ──────────────────────────

  Widget _buildReactionBar(TogetherService together) {
    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF18181C).withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.50),
            blurRadius: 20,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: _reactionEmojis.map((emoji) {
          final count = together.reactions[emoji] ?? 0;

          return PressableScale(
            onTap: () => _triggerReaction(together, emoji),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(emoji, style: const TextStyle(fontSize: 22)),
                if (count > 0) ...[
                  const SizedBox(width: 4),
                  Text(
                    '$count',
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.7),
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  String _formatDuration(Duration d) {
    final minutes = d.inMinutes;
    final seconds = d.inSeconds % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  String _formatTimestamp(int ms) {
    if (ms <= 0) return 'Just now';
    final diff = DateTime.now().millisecondsSinceEpoch - ms;
    if (diff < 60000) return 'Just now';
    final mins = diff ~/ 60000;
    if (mins < 60) return '${mins}m ago';
    return '${mins ~/ 60}h ago';
  }
}

// ────────────────────────── ADD TRACK MODAL SHEET ──────────────────────────

class _AddTrackModalSheet extends StatefulWidget {
  const _AddTrackModalSheet({required this.together});
  final TogetherService together;

  @override
  State<_AddTrackModalSheet> createState() => _AddTrackModalSheetState();
}

class _AddTrackModalSheetState extends State<_AddTrackModalSheet> {
  final TextEditingController _searchController = TextEditingController();
  List<Track> _results = [];
  bool _searching = false;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    _debounce?.cancel();
    final q = query.trim();
    if (q.isEmpty) {
      setState(() {
        _results = [];
        _searching = false;
      });
      return;
    }

    _debounce = Timer(const Duration(milliseconds: 350), () async {
      setState(() => _searching = true);
      try {
        final tracks = await InnerTubeService.instance.search(q);
        if (mounted) {
          setState(() {
            _results = tracks;
            _searching = false;
          });
        }
      } catch (_) {
        if (mounted) setState(() => _searching = false);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.78,
      padding: const EdgeInsets.only(top: 12),
      decoration: const BoxDecoration(
        color: Color(0xFF141416),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          // Pull bar
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 16),

          // Header
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Add Track to Room Queue',
                  style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white54),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),

          // Search Field
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Container(
              height: 46,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: const Color(0xFF1F1F23),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.search_rounded, color: Colors.white54, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: TextField(
                      controller: _searchController,
                      autofocus: true,
                      style: const TextStyle(color: Colors.white, fontSize: 13),
                      decoration: const InputDecoration(
                        hintText: 'Search title, artist or album...',
                        hintStyle: TextStyle(color: Colors.white38, fontSize: 12),
                        border: InputBorder.none,
                        isDense: true,
                      ),
                      onChanged: _onSearchChanged,
                    ),
                  ),
                  if (_searchController.text.isNotEmpty)
                    GestureDetector(
                      onTap: () {
                        _searchController.clear();
                        _onSearchChanged('');
                      },
                      child: const Icon(Icons.clear_rounded, color: Colors.white38, size: 18),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Search Results
          Expanded(
            child: _searching
                ? Center(child: CircularProgressIndicator(color: Zen.rose, strokeWidth: 2.5))
                : _results.isEmpty
                    ? Center(
                        child: Text(
                          _searchController.text.isEmpty
                              ? 'Type above to search YouTube Music tracks'
                              : 'No matching tracks found',
                          style: TextStyle(color: Zen.textMuted, fontSize: 12),
                        ),
                      )
                    : ListView.builder(
                        physics: const BouncingScrollPhysics(),
                        itemCount: _results.length,
                        itemBuilder: (context, index) {
                          final track = _results[index];
                          return ListTile(
                            contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
                            leading: ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Container(
                                width: 44,
                                height: 44,
                                color: const Color(0xFF27272A),
                                child: track.coverUrl.isNotEmpty
                                    ? Image.network(track.coverUrl, fit: BoxFit.cover, errorBuilder: (_, _, _) => const Icon(Icons.music_note, color: Colors.white38))
                                    : const Icon(Icons.music_note, color: Colors.white38),
                              ),
                            ),
                            title: Text(
                              track.title,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w700),
                            ),
                            subtitle: Text(
                              track.artist,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: Zen.textMuted, fontSize: 11),
                            ),
                            trailing: ZenButton(
                              label: 'ADD',
                              compact: true,
                              onTap: () {
                                HapticFeedback.lightImpact();
                                widget.together.addToQueue(track);
                                Navigator.of(context).pop();
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text('Added "${track.title}" to shared room queue 🎵'),
                                    backgroundColor: const Color(0xFF18181B),
                                    behavior: SnackBarBehavior.floating,
                                    duration: const Duration(seconds: 2),
                                  ),
                                );
                              },
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
