import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';

/// F25: Data Saved by Offline Mode Card.
///
/// Highlights mobile data saved via offline downloads and cached playback.
/// Strictly calculated at **160 kbps** audio quality (20 KB/s = 1.2 MB/min).
///
/// Renders [SizedBox.shrink()] if data saved is less than 10 MB.
class OfflineDataSavedCard extends StatelessWidget {
  const OfflineDataSavedCard({
    super.key,
    required this.bytesSaved,
    this.offlineMinutes,
  });

  /// Total bytes saved by offline listening.
  final int bytesSaved;

  /// Optional active minutes listened offline.
  final int? offlineMinutes;

  static const int _minThresholdBytes = 10 * 1024 * 1024; // 10 MB

  @override
  Widget build(BuildContext context) {
    if (bytesSaved < _minThresholdBytes) {
      return const SizedBox.shrink();
    }

    final formattedSize = _formatBytes(bytesSaved);
    final approxMinutes = offlineMinutes ?? ((bytesSaved / (20 * 1024)) / 60).round();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.signal_cellular_alt_rounded,
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
                      'DATA SAVED OFFLINE',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                    Text(
                      'High-efficiency 160 kbps playback savings',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          const SizedBox(height: 18),

          // Large Metric Display
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                formattedSize,
                style: const TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.w900,
                  color: AppTheme.brand,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(width: 10),
              const Text(
                'mobile data conserved',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textPrimary,
                ),
              ),
            ],
          ),

          const SizedBox(height: 12),

          // Narrative Comparison
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.03),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.border),
            ),
            child: Row(
              children: [
                const Icon(
                  Icons.offline_pin_rounded,
                  color: AppTheme.brand,
                  size: 20,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'You enjoyed ~$approxMinutes minutes of offline music without consuming mobile data.',
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.textSecondary,
                      height: 1.4,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  static String _formatBytes(int bytes) {
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;

    if (bytes >= gb) {
      final val = bytes / gb;
      return '${val.toStringAsFixed(1)} GB';
    } else {
      final val = bytes / mb;
      return '${val.round()} MB';
    }
  }
}
