import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/zen_button.dart';
import '../../design_system/zen.dart';
import '../../models/track.dart';
import '../../services/dock_visibility.dart';
import '../../services/player_state.dart';

class RoomTogetherScreen extends StatefulWidget {
  const RoomTogetherScreen({super.key});

  @override
  State<RoomTogetherScreen> createState() => _RoomTogetherScreenState();
}

class _FloatingEmoji {
  _FloatingEmoji(this.emoji, this.left)
      : id = DateTime.now().microsecondsSinceEpoch,
        opacity = 1.0,
        bottom = 100.0;
  final int id;
  final String emoji;
  final double left;
  double bottom;
  double opacity;
}

class _RoomTogetherScreenState extends State<RoomTogetherScreen>
    with SingleTickerProviderStateMixin, HideDocksMixin {
  bool _inRoom = true;
  String _roomCode = 'ZEN-8921';
  int _activeTab = 0; // 0: Queue, 1: Chat, 2: People
  final TextEditingController _chatController = TextEditingController();
  final TextEditingController _joinCodeController = TextEditingController();

  final List<Map<String, String>> _messages = [
    {'name': 'Host (You)', 'text': 'Welcome to the Zenify Hi-Fi room! 🎧', 'time': 'Just now', 'isMe': 'true'},
    {'name': 'Priya', 'text': 'Vibe is crazy good with 8D on 🔥', 'time': '1m ago', 'isMe': 'false'},
    {'name': 'Alex', 'text': 'Play the next track from Anirudh!', 'time': 'Just now', 'isMe': 'false'},
  ];

  final List<Map<String, dynamic>> _listeners = [
    {'name': 'You (Host)', 'role': 'Host', 'color': Zen.rose, 'ping': '8ms'},
    {'name': 'Priya S.', 'role': 'Listener', 'color': const Color(0xFF6366F1), 'ping': '14ms'},
    {'name': 'Alex M.', 'role': 'Listener', 'color': const Color(0xFF10B981), 'ping': '19ms'},
    {'name': 'Karthik', 'role': 'Listener', 'color': const Color(0xFFF59E0B), 'ping': '22ms'},
  ];

  final List<_FloatingEmoji> _activeEmojis = [];
  Timer? _emojiTimer;

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
    _joinCodeController.dispose();
    super.dispose();
  }

  void _triggerReaction(String emoji) {
    HapticFeedback.lightImpact();
    final rng = math.Random();
    final leftPos = 40.0 + rng.nextDouble() * (MediaQuery.of(context).size.width - 100.0);
    setState(() {
      _activeEmojis.add(_FloatingEmoji(emoji, leftPos));
    });
  }

  void _tickEmojis() {
    if (_activeEmojis.isEmpty) return;
    setState(() {
      for (final e in _activeEmojis) {
        e.bottom += 4.5;
        e.opacity -= 0.022;
      }
      _activeEmojis.removeWhere((e) => e.opacity <= 0.05 || e.bottom > 600);
    });
  }

  void _sendMessage() {
    final text = _chatController.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() {
      _messages.add({
        'name': 'Host (You)',
        'text': text,
        'time': 'Just now',
        'isMe': 'true',
      });
      _chatController.clear();
    });
  }

  void _copyCode() {
    Clipboard.setData(ClipboardData(text: _roomCode));
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('Room code $_roomCode copied to clipboard!'),
        backgroundColor: const Color(0xFF18181B),
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final player = context.watch<PlayerState>();
    final current = player.currentTrack;

    return Scaffold(
      backgroundColor: Zen.bg,
      body: Stack(
        children: [
          CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              // Room Header
              SliverAppBar(
                pinned: true,
                backgroundColor: Zen.bg.withValues(alpha: 0.88),
                elevation: 0,
                leading: IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                  onPressed: () => Navigator.of(context).pop(),
                ),
                title: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.group_rounded, color: Colors.white70, size: 18),
                    const SizedBox(width: 8),
                    const Text(
                      'Room Together',
                      style: TextStyle(color: Colors.white, fontSize: 17, fontWeight: FontWeight.w700),
                    ),
                  ],
                ),
                centerTitle: true,
                actions: [
                  IconButton(
                    icon: const Icon(Icons.share_rounded, color: Colors.white70, size: 20),
                    onPressed: _copyCode,
                  ),
                ],
              ),

              if (!_inRoom)
                SliverFillRemaining(
                  child: _buildLobbyView(),
                )
              else ...[
                // Room Code & Live Info Bar
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: _buildRoomCodeBanner(),
                  ),
                ),

                // Now Playing in Room Card
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: _buildNowPlayingRoomCard(player, current),
                  ),
                ),

                // Tabs: Queue, Chat, People
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: _buildSegmentedTabs(),
                  ),
                ),

                // Tab Content
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: _activeTab == 0
                        ? _buildQueueTab(player)
                        : _activeTab == 1
                            ? _buildChatTab()
                            : _buildPeopleTab(),
                  ),
                ),

                // Room actions & bottom spacing
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
                    child: Column(
                      children: [
                        ZenButton(
                          label: 'LEAVE ROOM',
                          width: double.infinity,
                          icon: Icons.logout_rounded,
                          accentColor: Colors.white70,
                          onTap: () => setState(() => _inRoom = false),
                        ),
                        const SizedBox(height: 120),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),

          // Floating Reaction Emojis Overlay
          ..._activeEmojis.map((e) {
            return Positioned(
              left: e.left,
              bottom: e.bottom,
              child: Opacity(
                opacity: e.opacity.clamp(0.0, 1.0),
                child: Text(e.emoji, style: const TextStyle(fontSize: 32)),
              ),
            );
          }),

          // Bottom Quick Reaction Bar (when in room)
          if (_inRoom)
            Positioned(
              left: 20,
              right: 20,
              bottom: 24,
              child: _buildReactionBar(),
            ),
        ],
      ),
    );
  }

  Widget _buildLobbyView() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: Zen.rose.withValues(alpha: 0.15),
              shape: BoxShape.circle,
              border: Border.all(color: Zen.rose.withValues(alpha: 0.3)),
            ),
            child: Icon(Icons.spatial_audio_off_rounded, color: Zen.rose, size: 36),
          ),
          const SizedBox(height: 20),
          const Text(
            'Listen Together',
            style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          Text(
            'Listen to full-fidelity music in sync with friends, share queues and react in real-time.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Zen.textMuted, fontSize: 13, height: 1.4),
          ),
          const SizedBox(height: 32),
          ZenButton(
            label: 'CREATE NEW ROOM',
            width: double.infinity,
            icon: Icons.add_rounded,
            onTap: () {
              HapticFeedback.mediumImpact();
              setState(() => _inRoom = true);
            },
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 44,
                  padding: const EdgeInsets.symmetric(horizontal: 14),
                  decoration: BoxDecoration(
                    color: const Color(0xFF18181B),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                  ),
                  child: TextField(
                    controller: _joinCodeController,
                    style: const TextStyle(color: Colors.white, fontSize: 13, letterSpacing: 1.5),
                    decoration: const InputDecoration(
                      hintText: 'ENTER 6-DIGIT CODE',
                      hintStyle: TextStyle(color: Colors.white38, fontSize: 11, letterSpacing: 1.5),
                      border: InputBorder.none,
                      isDense: true,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              ZenButton(
                label: 'JOIN',
                onTap: () {
                  if (_joinCodeController.text.isNotEmpty) {
                    setState(() {
                      _roomCode = _joinCodeController.text.toUpperCase();
                      _inRoom = true;
                    });
                  }
                },
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRoomCodeBanner() {
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
                'LIVE ROOM',
                style: TextStyle(color: Color(0xFF10B981), fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 1.2),
              ),
              const SizedBox(width: 12),
              Text(
                _roomCode,
                style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800, letterSpacing: 1.2),
              ),
            ],
          ),
          PressableScale(
            onTap: _copyCode,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
              ),
              child: Text(
                'COPY CODE',
                style: TextStyle(color: Zen.rose, fontSize: 9, fontWeight: FontWeight.w700, letterSpacing: 1.2),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildNowPlayingRoomCard(PlayerState player, Track? current) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Container(
              width: 58,
              height: 58,
              color: const Color(0xFF27272A),
              child: current?.coverUrl != null
                  ? Image.network(current!.coverUrl, fit: BoxFit.cover, errorBuilder: (context, error, stackTrace) => const Icon(Icons.music_note, color: Colors.white54))
                  : const Icon(Icons.music_note, color: Colors.white54),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: Zen.rose.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'SYNCED',
                        style: TextStyle(color: Zen.rose, fontSize: 8, fontWeight: FontWeight.w800, letterSpacing: 1.0),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text('• 4 Listeners', style: TextStyle(color: Zen.textMuted, fontSize: 11)),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  current?.title ?? 'No Track Playing',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700),
                ),
                Text(
                  current?.artist ?? 'Select a song to start',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: Zen.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(
              player.isPlaying ? Icons.pause_circle_filled_rounded : Icons.play_circle_filled_rounded,
              color: Zen.rose,
              size: 40,
            ),
            onPressed: () {
              HapticFeedback.selectionClick();
              player.togglePlay();
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSegmentedTabs() {
    const tabs = ['QUEUE', 'CHAT', 'PEOPLE'];
    return Container(
      height: 36,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: const Color(0xFF141416),
        borderRadius: BorderRadius.circular(10),
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
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Text(
                  tabs[i],
                  style: TextStyle(
                    color: selected ? Colors.white : Zen.textMuted,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.2,
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildQueueTab(PlayerState player) {
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
                style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.2),
              ),
              Text(
                '${player.queue.length} TRACKS',
                style: TextStyle(color: Zen.rose, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.0),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (player.queue.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Center(
                child: Text('Room queue is empty. Tap search to add tracks.', style: TextStyle(color: Zen.textMuted, fontSize: 13)),
              ),
            )
          else
            ...player.queue.take(6).map((track) {
              final isCurrent = player.currentTrack?.id == track.id;
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                decoration: BoxDecoration(
                  color: isCurrent ? Zen.rose.withValues(alpha: 0.12) : Colors.white.withValues(alpha: 0.04),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(isCurrent ? Icons.volume_up_rounded : Icons.music_note_rounded, color: isCurrent ? Zen.rose : Colors.white54, size: 16),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(track.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                          Text(track.artist, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Zen.textMuted, fontSize: 11)),
                        ],
                      ),
                    ),
                    Text('by Host', style: TextStyle(color: Zen.textMuted, fontSize: 10)),
                  ],
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildChatTab() {
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
            'ROOM CHAT',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.2),
          ),
          const SizedBox(height: 12),
          ..._messages.map((m) {
            final isMe = m['isMe'] == 'true';
            return Container(
              margin: const EdgeInsets.only(bottom: 10),
              alignment: isMe ? Alignment.centerRight : Alignment.centerLeft,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: isMe ? Zen.rose.withValues(alpha: 0.2) : Colors.white.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: isMe ? Zen.rose.withValues(alpha: 0.3) : Colors.white.withValues(alpha: 0.06)),
                ),
                child: Column(
                  crossAxisAlignment: isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: [
                    Text(m['name']!, style: TextStyle(color: isMe ? Zen.rose : Colors.white70, fontSize: 10, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 2),
                    Text(m['text']!, style: const TextStyle(color: Colors.white, fontSize: 13)),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Container(
                  height: 40,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                  ),
                  child: TextField(
                    controller: _chatController,
                    style: const TextStyle(color: Colors.white, fontSize: 13),
                    decoration: const InputDecoration(hintText: 'Type a message...', hintStyle: TextStyle(color: Colors.white38, fontSize: 12), border: InputBorder.none, isDense: true),
                    onSubmitted: (_) => _sendMessage(),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ZenButton(label: 'SEND', compact: true, onTap: _sendMessage),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPeopleTab() {
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
                'PARTICIPANTS',
                style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.2),
              ),
              Text(
                '${_listeners.length} ONLINE',
                style: const TextStyle(color: Color(0xFF10B981), fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.0),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ..._listeners.map((l) {
            final color = l['color'] as Color;
            return Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.04),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: color.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                      border: Border.all(color: color.withValues(alpha: 0.4)),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      l['name']![0],
                      style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(l['name'] as String, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                        Text(l['role'] as String, style: TextStyle(color: Zen.textMuted, fontSize: 11)),
                      ],
                    ),
                  ),
                  Text(l['ping'] as String, style: TextStyle(color: Zen.textMuted, fontSize: 11)),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildReactionBar() {
    return Container(
      height: 52,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: const Color(0xFF18181C).withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.45),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: _reactionEmojis.map((emoji) {
          return PressableScale(
            onTap: () => _triggerReaction(emoji),
            child: Text(emoji, style: const TextStyle(fontSize: 22)),
          );
        }).toList(),
      ),
    );
  }
}
