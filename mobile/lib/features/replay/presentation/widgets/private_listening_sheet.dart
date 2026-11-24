import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../../services/dock_visibility.dart';
import '../../data/exclusion_store.dart';

/// F26: Private Listening & Replay Exclusions Sheet.
///
/// Allows users to exclude certain tracks, playlists, or entire sessions
/// from appearing in their Replay & Insights.
///
/// Strictly applies exclusions at read time (nothing is permanently deleted).
class PrivateListeningSheet extends StatefulWidget {
  const PrivateListeningSheet({
    super.key,
    required this.exclusionStore,
    this.onExclusionsChanged,
  });

  final ExclusionStore exclusionStore;
  final VoidCallback? onExclusionsChanged;

  static Future<void> show(
    BuildContext context, {
    required ExclusionStore exclusionStore,
    VoidCallback? onExclusionsChanged,
  }) {
    return DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (ctx) => DraggableScrollableSheet(
          initialChildSize: 0.75,
          minChildSize: 0.4,
          maxChildSize: 0.9,
          builder: (ctx, scrollController) => Container(
            decoration: const BoxDecoration(
              color: AppTheme.canvas,
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            child: Column(
              children: [
                const SizedBox(height: 12),
                Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 12),
                Expanded(
                  child: SingleChildScrollView(
                    controller: scrollController,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 8,
                    ),
                    child: PrivateListeningSheet(
                      exclusionStore: exclusionStore,
                      onExclusionsChanged: onExclusionsChanged,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  State<PrivateListeningSheet> createState() => _PrivateListeningSheetState();
}

class _PrivateListeningSheetState extends State<PrivateListeningSheet> {
  final TextEditingController _trackController = TextEditingController();

  @override
  void dispose() {
    _trackController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.exclusionStore;
    final excludedTracks = store.trackIds.toList();
    final excludedPlaylists = store.playlistIds.toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Sheet Header
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppTheme.brand.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.visibility_off_rounded,
                      color: AppTheme.brand,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'PRIVATE LISTENING',
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                            color: AppTheme.textPrimary,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          'Exclude tracks or playlists from your Replay',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppTheme.textSecondary,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              icon: const Icon(Icons.close_rounded, color: AppTheme.textMuted),
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),

        const SizedBox(height: 20),

        // Info Card
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.04),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.border),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline_rounded, color: AppTheme.brand, size: 18),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Excluded items will never affect your Replay stats, top artists, or year-end digests. You can unhide them at any time.',
                  style: TextStyle(
                    fontSize: 12,
                    color: AppTheme.textSecondary,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 24),

        // Add Excluded Track ID Input
        const Text(
          'EXCLUDE A TRACK',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: AppTheme.textMuted,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 8),

        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _trackController,
                style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.textPrimary,
                ),
                decoration: InputDecoration(
                  hintText: 'Enter Track ID to exclude',
                  hintStyle: const TextStyle(
                    fontSize: 13,
                    color: AppTheme.textMuted,
                  ),
                  filled: true,
                  fillColor: Colors.white.withValues(alpha: 0.05),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: AppTheme.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: AppTheme.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: AppTheme.brand),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            ElevatedButton(
              onPressed: () async {
                final text = _trackController.text.trim();
                if (text.isNotEmpty) {
                  await store.excludeTrack(text);
                  _trackController.clear();
                  setState(() {});
                  widget.onExclusionsChanged?.call();
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.brand,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
              ),
              child: const Text(
                'Exclude',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),

        const SizedBox(height: 24),

        // Excluded Tracks List
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'EXCLUDED TRACKS',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppTheme.textMuted,
                letterSpacing: 0.5,
              ),
            ),
            Text(
              '${excludedTracks.length} excluded',
              style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
            ),
          ],
        ),
        const SizedBox(height: 8),

        if (excludedTracks.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.02),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.border),
            ),
            child: const Text(
              'No tracks currently excluded',
              style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
            ),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: excludedTracks.length,
            separatorBuilder: (_, _) =>
                const Divider(color: AppTheme.border, height: 1),
            itemBuilder: (context, index) {
              final trackId = excludedTracks[index];
              return ListTile(
                dense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                title: Text(
                  trackId,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppTheme.textPrimary,
                  ),
                ),
                trailing: IconButton(
                  icon: const Icon(
                    Icons.delete_outline_rounded,
                    color: Colors.redAccent,
                    size: 18,
                  ),
                  onPressed: () async {
                    await store.unexcludeTrack(trackId);
                    setState(() {});
                    widget.onExclusionsChanged?.call();
                  },
                ),
              );
            },
          ),

        const SizedBox(height: 24),

        // Excluded Playlists
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'EXCLUDED PLAYLISTS',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppTheme.textMuted,
                letterSpacing: 0.5,
              ),
            ),
            Text(
              '${excludedPlaylists.length} excluded',
              style: const TextStyle(fontSize: 11, color: AppTheme.textMuted),
            ),
          ],
        ),
        const SizedBox(height: 8),

        if (excludedPlaylists.isEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.02),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppTheme.border),
            ),
            child: const Text(
              'No playlists currently excluded',
              style: TextStyle(fontSize: 12, color: AppTheme.textMuted),
            ),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: excludedPlaylists.length,
            separatorBuilder: (_, _) =>
                const Divider(color: AppTheme.border, height: 1),
            itemBuilder: (context, index) {
              final plId = excludedPlaylists[index];
              return ListTile(
                dense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                title: Text(
                  plId,
                  style: const TextStyle(
                    fontSize: 13,
                    color: AppTheme.textPrimary,
                  ),
                ),
                trailing: IconButton(
                  icon: const Icon(
                    Icons.delete_outline_rounded,
                    color: Colors.redAccent,
                    size: 18,
                  ),
                  onPressed: () async {
                    await store.unexcludePlaylist(plId);
                    setState(() {});
                    widget.onExclusionsChanged?.call();
                  },
                ),
              );
            },
          ),
      ],
    );
  }
}
