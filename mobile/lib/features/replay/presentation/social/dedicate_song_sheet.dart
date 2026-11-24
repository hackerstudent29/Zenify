import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../services/dock_visibility.dart';
import '../../domain/models/gift_models.dart';
import '../../domain/replay_aggregate.dart';
import '../../domain/services/gift_service.dart';

/// Modal bottom sheet for F18: Dedicate / Gift a Song.
/// Lets users create a shareable card with a custom note (max 140 chars).
class DedicateSongSheet extends StatefulWidget {
  final SongStat song;
  final ValueChanged<GiftSong>? onGiftCreated;

  const DedicateSongSheet({
    super.key,
    required this.song,
    this.onGiftCreated,
  });

  static Future<GiftSong?> show(
    BuildContext context, {
    required SongStat song,
    ValueChanged<GiftSong>? onGiftCreated,
  }) {
    return DockVisibility.runModal(
      () => showModalBottomSheet<GiftSong>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => DedicateSongSheet(
          song: song,
          onGiftCreated: onGiftCreated,
        ),
      ),
    );
  }

  @override
  State<DedicateSongSheet> createState() => _DedicateSongSheetState();
}

class _DedicateSongSheetState extends State<DedicateSongSheet> {
  final TextEditingController _noteController = TextEditingController();
  final TextEditingController _senderController = TextEditingController();
  GiftSong? _createdGift;

  @override
  void dispose() {
    _noteController.dispose();
    _senderController.dispose();
    super.dispose();
  }

  void _onCreateGift() {
    final note = _noteController.text.trim();
    if (note.isEmpty) return;

    final gift = GiftService.createGiftCard(
      song: widget.song,
      note: note,
      senderName: _senderController.text.trim().isNotEmpty ? _senderController.text.trim() : null,
    );

    setState(() {
      _createdGift = gift;
    });

    widget.onGiftCreated?.call(gift);
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Container(
      decoration: const BoxDecoration(
        color: Color(0xFF141416),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.fromLTRB(20, 12, 20, 24 + bottomInset),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Drag handle
            Center(
              child: Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),

            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppTheme.brand.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.card_giftcard_rounded,
                        color: AppTheme.brand,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 10),
                    const Text(
                      'DEDICATE A SONG',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ],
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted),
                  onPressed: () => Navigator.of(context).pop(_createdGift),
                ),
              ],
            ),

            const SizedBox(height: 16),

            // Song Showcase Card
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.border),
              ),
              child: Row(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: widget.song.coverUrl != null && widget.song.coverUrl!.isNotEmpty
                        ? Image.network(
                            widget.song.coverUrl!,
                            width: 52,
                            height: 52,
                            fit: BoxFit.cover,
                            errorBuilder: (_, _, _) => _buildArtPlaceholder(),
                          )
                        : _buildArtPlaceholder(),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          widget.song.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.textPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          widget.song.artistRaw,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          '${widget.song.qualifiedPlays} plays in your Replay',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.brand),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 20),

            if (_createdGift == null) ...[
              // Your Name (Optional)
              const Text(
                'YOUR NAME (OPTIONAL)',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textMuted, letterSpacing: 0.5),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _senderController,
                style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  hintText: 'e.g. Rahul',
                  hintStyle: const TextStyle(fontSize: 13, color: AppTheme.textMuted),
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.05),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.brand)),
                ),
              ),

              const SizedBox(height: 16),

              // Personal Note (Max 140 chars)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'PERSONAL NOTE (MAX 140 CHARS)',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textMuted, letterSpacing: 0.5),
                  ),
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: _noteController,
                    builder: (_, val, child) {
                      return Text(
                        '${val.text.length}/140',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: val.text.length > 140 ? Colors.redAccent : AppTheme.textMuted,
                        ),
                      );
                    },
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _noteController,
                maxLength: 140,
                maxLines: 3,
                style: const TextStyle(fontSize: 13, color: AppTheme.textPrimary),
                decoration: InputDecoration(
                  counterText: '',
                  hintText: 'This song defined my month, thought you would love it...',
                  hintStyle: const TextStyle(fontSize: 13, color: AppTheme.textMuted),
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.05),
                  contentPadding: const EdgeInsets.all(14),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
                  enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.border)),
                  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: AppTheme.brand)),
                ),
              ),

              const SizedBox(height: 20),

              // Create Gift Card Button
              ValueListenableBuilder<TextEditingValue>(
                valueListenable: _noteController,
                builder: (_, val, child) {
                  final canCreate = val.text.trim().isNotEmpty && val.text.length <= 140;

                  return ElevatedButton.icon(
                    onPressed: canCreate ? _onCreateGift : null,
                    icon: const Icon(Icons.send_rounded, size: 16),
                    label: const Text(
                      'CREATE GIFT CARD',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.5),
                    ),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppTheme.brand,
                      foregroundColor: Colors.white,
                      disabledBackgroundColor: AppTheme.brand.withValues(alpha: 0.3),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                  );
                },
              ),
            ] else ...[
              // Gift Created Preview Card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      AppTheme.brand.withValues(alpha: 0.25),
                      Colors.white.withValues(alpha: 0.05),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppTheme.brand.withValues(alpha: 0.4)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.favorite_rounded, color: AppTheme.brand, size: 18),
                        const SizedBox(width: 8),
                        Text(
                          'A Gift From ${_createdGift!.senderName}',
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800, color: Colors.white),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      '"${_createdGift!.note}"',
                      style: const TextStyle(fontSize: 14, fontStyle: FontStyle.italic, color: Colors.white, height: 1.4),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Featuring: ${widget.song.title} · ${widget.song.artistRaw}',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.brand),
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 16),

              // Copy Link & Share Actions
              ElevatedButton.icon(
                onPressed: () {
                  final link = GiftService.generateShareUrl(_createdGift!);
                  Clipboard.setData(ClipboardData(text: link));
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Gift card link copied to clipboard! 🎁'),
                      backgroundColor: AppTheme.brand,
                    ),
                  );
                },
                icon: const Icon(Icons.copy_rounded, size: 16),
                label: const Text(
                  'COPY GIFT LINK',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800, letterSpacing: 0.5),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.brand,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildArtPlaceholder() {
    return Container(
      width: 52,
      height: 52,
      color: Colors.white.withValues(alpha: 0.08),
      child: const Icon(Icons.music_note_rounded, size: 24, color: AppTheme.textMuted),
    );
  }
}
