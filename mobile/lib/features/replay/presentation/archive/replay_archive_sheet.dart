import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/replay_aggregate.dart';
import '../../domain/services/replay_archive_service.dart';

/// Modal bottom sheet for F21: Replay Archive ("Time Machine").
/// Allows browsing past saved snapshots and traveling back in music time.
class ReplayArchiveSheet extends StatefulWidget {
  final ReplayArchiveService archiveService;
  final ReplayAggregate? currentSnapshot;
  final ValueChanged<ReplayAggregate>? onSelectSnapshot;

  const ReplayArchiveSheet({
    super.key,
    required this.archiveService,
    this.currentSnapshot,
    this.onSelectSnapshot,
  });

  static Future<void> show(
    BuildContext context, {
    required ReplayArchiveService archiveService,
    ReplayAggregate? currentSnapshot,
    ValueChanged<ReplayAggregate>? onSelectSnapshot,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ReplayArchiveSheet(
        archiveService: archiveService,
        currentSnapshot: currentSnapshot,
        onSelectSnapshot: onSelectSnapshot,
      ),
    );
  }

  @override
  State<ReplayArchiveSheet> createState() => _ReplayArchiveSheetState();
}

class _ReplayArchiveSheetState extends State<ReplayArchiveSheet> {
  List<ArchivePeriodEntry> _entries = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadArchives();
  }

  Future<void> _loadArchives() async {
    final list = await widget.archiveService.listSnapshots();
    if (mounted) {
      setState(() {
        _entries = list;
        _loading = false;
      });
    }
  }

  Future<void> _saveCurrentToArchive() async {
    if (widget.currentSnapshot == null) return;
    setState(() => _loading = true);
    await widget.archiveService.saveSnapshot(widget.currentSnapshot!);
    await _loadArchives();
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${widget.currentSnapshot!.period.label} saved to Time Machine!'),
          backgroundColor: AppTheme.brand,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.78,
      decoration: const BoxDecoration(
        color: Color(0xFF141416),
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
            child: Row(
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
                          Icons.history_rounded,
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
                              'REPLAY ARCHIVE',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.5,
                                color: AppTheme.textPrimary,
                              ),
                              overflow: TextOverflow.ellipsis,
                            ),
                            Text(
                              'Travel through saved past music periods',
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
          ),

          const Divider(height: 1, color: AppTheme.border),

          // Content
          Expanded(
            child: _loading
                ? const Center(
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: AppTheme.brand,
                    ),
                  )
                : _entries.isEmpty
                    ? _buildEmptyState()
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
                        itemCount: _entries.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          final entry = _entries[index];
                          return _buildArchiveCard(entry);
                        },
                      ),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.04),
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.border),
              ),
              child: const Icon(
                Icons.auto_awesome_motion_rounded,
                size: 40,
                color: AppTheme.textMuted,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'No Saved Snapshots Yet',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Past weeks and months are automatically captured as they close, or you can save your current snapshot right now.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: AppTheme.textSecondary,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 24),
            if (widget.currentSnapshot != null)
              ElevatedButton.icon(
                onPressed: _saveCurrentToArchive,
                icon: const Icon(Icons.bookmark_add_rounded, size: 16),
                label: const Text(
                  'SAVE CURRENT PERIOD',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.brand,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildArchiveCard(ArchivePeriodEntry entry) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Row(
        children: [
          // Artwork or Icon
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: entry.topSongArtwork != null && entry.topSongArtwork!.isNotEmpty
                ? Image.network(
                    entry.topSongArtwork!,
                    width: 52,
                    height: 52,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => _buildFallbackArt(),
                  )
                : _buildFallbackArt(),
          ),
          const SizedBox(width: 14),

          // Details
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.label.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.textPrimary,
                    letterSpacing: 0.3,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${entry.totalMinutes} mins · ${entry.uniqueSongs} songs',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.brand,
                  ),
                ),
                if (entry.topSongTitle != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    'Top: ${entry.topSongTitle} · ${entry.topSongArtist ?? ''}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppTheme.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),

          // Action Button
          ElevatedButton(
            onPressed: () async {
              final snapshot = await widget.archiveService.loadSnapshot(entry.periodKey);
              if (snapshot != null && mounted) {
                if (Navigator.of(context).canPop()) {
                  Navigator.of(context).pop();
                }
                widget.onSelectSnapshot?.call(snapshot);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white.withValues(alpha: 0.08),
              foregroundColor: AppTheme.textPrimary,
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
                side: const BorderSide(color: AppTheme.border),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            ),
            child: const Text(
              'VIEW',
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.5,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFallbackArt() {
    return Container(
      width: 52,
      height: 52,
      color: Colors.white.withValues(alpha: 0.06),
      child: const Icon(
        Icons.music_note_rounded,
        color: AppTheme.textMuted,
        size: 24,
      ),
    );
  }
}
