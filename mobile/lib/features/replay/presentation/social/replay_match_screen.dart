import 'package:flutter/material.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/models/match_models.dart';

/// Screen for F17: Replay Match & Musical Battle.
/// Compares two users' Replays side-by-side and declares a Music Titan winner.
class ReplayMatchScreen extends StatelessWidget {
  final MatchSnapshot mySnapshot;
  final MatchSnapshot friendSnapshot;
  final MatchResult matchResult;
  final VoidCallback? onShare;

  const ReplayMatchScreen({
    super.key,
    required this.mySnapshot,
    required this.friendSnapshot,
    required this.matchResult,
    this.onShare,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121214),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Top Bar
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      if (Navigator.of(context).canPop())
                        IconButton(
                          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
                          onPressed: () => Navigator.of(context).pop(),
                        ),
                      const Text(
                        'MUSICAL BATTLE',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.5,
                          color: AppTheme.textPrimary,
                        ),
                      ),
                    ],
                  ),
                  if (onShare != null)
                    IconButton(
                      icon: const Icon(Icons.share_rounded, color: AppTheme.brand, size: 20),
                      onPressed: onShare,
                    ),
                ],
              ),

              const SizedBox(height: 20),

              // Hero Compatibility Card
              _buildCompatibilityHero(),

              const SizedBox(height: 20),

              // Titan Crown Winner Banner
              _buildWinnerBanner(),

              const SizedBox(height: 24),

              // Side-by-Side Comparison Table
              _buildComparisonTable(),

              const SizedBox(height: 24),

              // Shared Favorites (Songs & Artists)
              if (matchResult.sharedArtists.isNotEmpty || matchResult.sharedTracks.isNotEmpty)
                _buildSharedRotation(),

              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCompatibilityHero() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            AppTheme.brand.withValues(alpha: 0.25),
            Colors.white.withValues(alpha: 0.04),
          ],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppTheme.brand.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              _buildAvatar(mySnapshot.displayName, true),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'VS',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w900,
                    color: Colors.white.withValues(alpha: 0.4),
                    letterSpacing: 1.5,
                  ),
                ),
              ),
              _buildAvatar(friendSnapshot.displayName, false),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            '${matchResult.compatibilityScore}%',
            style: const TextStyle(
              fontSize: 64,
              fontWeight: FontWeight.w900,
              color: Colors.white,
              letterSpacing: -2,
            ),
          ),
          const Text(
            'MUSICALLY COMPATIBLE',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: AppTheme.brand,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Based on shared artists, genres, song rotations and listening rhythms',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              color: Colors.white.withValues(alpha: 0.6),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAvatar(String name, bool isMe) {
    return Column(
      children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: isMe ? AppTheme.brand : const Color(0xFF2C2C2E),
            border: Border.all(color: Colors.white.withValues(alpha: 0.2), width: 2),
          ),
          alignment: Alignment.center,
          child: Text(
            name.isNotEmpty ? name[0].toUpperCase() : '?',
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          name,
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white),
        ),
      ],
    );
  }

  Widget _buildWinnerBanner() {
    String title;
    String subtitle;
    IconData icon;
    Color color;

    if (matchResult.iWon) {
      title = '👑 MUSIC TITAN: ${mySnapshot.displayName.toUpperCase()}';
      subtitle = 'Higher listening hours, discovery rate & unique track depth';
      icon = Icons.emoji_events_rounded;
      color = AppTheme.brand;
    } else if (matchResult.friendWon) {
      title = '👑 MUSIC TITAN: ${friendSnapshot.displayName.toUpperCase()}';
      subtitle = 'Deeper catalogs explored & broader listening variety';
      icon = Icons.emoji_events_rounded;
      color = Colors.amberAccent;
    } else {
      title = '🤝 EPIC DRAW: PERFECT HARMONY';
      subtitle = 'Equally matched music energy across all dimensions';
      icon = Icons.handshake_rounded;
      color = Colors.blueAccent;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.5,
                    color: color,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.7)),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildComparisonTable() {
    final hoursMe = (mySnapshot.totalMinutes / 60.0).toStringAsFixed(1);
    final hoursFriend = (friendSnapshot.totalMinutes / 60.0).toStringAsFixed(1);

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'HEAD-TO-HEAD STATS',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.textMuted,
                    letterSpacing: 0.5,
                  ),
                ),
                Text(
                  '${mySnapshot.displayName} vs ${friendSnapshot.displayName}',
                  style: const TextStyle(fontSize: 11, color: AppTheme.textSecondary),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: AppTheme.border),
          _buildRow('Total Hours', '${hoursMe}h', '${hoursFriend}h', mySnapshot.totalMinutes >= friendSnapshot.totalMinutes),
          _buildRow('Unique Artists', '${mySnapshot.uniqueArtistsCount}', '${friendSnapshot.uniqueArtistsCount}', mySnapshot.uniqueArtistsCount >= friendSnapshot.uniqueArtistsCount),
          _buildRow('Unique Songs', '${mySnapshot.uniqueSongsCount}', '${friendSnapshot.uniqueSongsCount}', mySnapshot.uniqueSongsCount >= friendSnapshot.uniqueSongsCount),
          _buildRow('Discovery Score', '${mySnapshot.discoveryPct.round()}%', '${friendSnapshot.discoveryPct.round()}%', mySnapshot.discoveryPct >= friendSnapshot.discoveryPct),
          if (mySnapshot.topLanguage != null || friendSnapshot.topLanguage != null)
            _buildRow('Top Language', mySnapshot.topLanguage ?? '—', friendSnapshot.topLanguage ?? '—', null),
          if (mySnapshot.topGenre != null || friendSnapshot.topGenre != null)
            _buildRow('Top Sound / Movie', mySnapshot.topGenre ?? '—', friendSnapshot.topGenre ?? '—', null),
        ],
      ),
    );
  }

  Widget _buildRow(String metric, String valMe, String valFriend, bool? meWon) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: AppTheme.border, width: 0.5)),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 4,
            child: Text(
              metric,
              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.textSecondary),
            ),
          ),
          Expanded(
            flex: 3,
            child: Text(
              valMe,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                fontWeight: meWon == true ? FontWeight.w800 : FontWeight.w600,
                color: meWon == true ? AppTheme.brand : AppTheme.textPrimary,
              ),
            ),
          ),
          Expanded(
            flex: 3,
            child: Text(
              valFriend,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                fontWeight: meWon == false ? FontWeight.w800 : FontWeight.w600,
                color: meWon == false ? AppTheme.brand : AppTheme.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSharedRotation() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'SHARED ROTATION & OBSESSIONS',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: AppTheme.textMuted,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 10),
        if (matchResult.sharedArtists.isNotEmpty) ...[
          const Text('Common Artists', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: matchResult.sharedArtists.map((artist) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.05),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.border),
                ),
                child: Text(
                  artist.toUpperCase(),
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.textPrimary),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 12),
        ],
        if (matchResult.sharedTracks.isNotEmpty) ...[
          const Text('Common Tracks', style: TextStyle(fontSize: 12, color: AppTheme.textSecondary)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: matchResult.sharedTracks.map((trackId) {
              return Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: AppTheme.brand.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppTheme.brand.withValues(alpha: 0.3)),
                ),
                child: Text(
                  trackId,
                  style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.white),
                ),
              );
            }).toList(),
          ),
        ],
      ],
    );
  }
}
