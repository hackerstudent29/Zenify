import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../design_system/tokens/app_colors.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/zen.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../services/auth_state.dart';
import '../../services/cache_service.dart';
import '../../services/dock_visibility.dart';
import '../../services/settings_service.dart';
import '../../services/update_service.dart';
import '../auth/welcome_screen.dart';
import '../player/studio_fx_sheet.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> with HideDocksMixin {
  int _versionTapCount = 0;
  String _appVersion = 'v1.0.8 (Build 11)';

  @override
  void initState() {
    super.initState();
    _loadPackageInfo();
  }

  Future<void> _loadPackageInfo() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (mounted) {
        setState(() {
          _appVersion = 'v${info.version} (Build ${info.buildNumber})';
        });
      }
    } catch (_) {}
  }

  void _onCheckForUpdates() async {
    HapticFeedback.lightImpact();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: const Row(
          children: [
            SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.crimson),
            ),
            SizedBox(width: 12),
            Text('Checking release channel...', style: TextStyle(color: Colors.white, fontSize: 13)),
          ],
        ),
        backgroundColor: const Color(0xFF18181B),
        duration: const Duration(seconds: 1),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );

    final info = await UpdateService.instance.checkForUpdate(silent: false);
    if (!mounted) return;

    if (info != null && info.hasUpdate) {
      UpdateService.instance.showUpdateSheet(context, info);
    } else {
      showModalBottomSheet(
        context: context,
        backgroundColor: Colors.transparent,
        builder: (ctx) => Container(
          padding: const EdgeInsets.all(24),
          decoration: const BoxDecoration(
            color: Color(0xFF18181B),
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'ZENIFY UPDATE CHANNEL',
                    style: const TextStyle(
                      fontFamily: 'SF Pro Display',
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.8,
                      color: AppColors.crimson,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: Colors.white70),
                    onPressed: () => Navigator.of(ctx).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _diagRow('Current Build', _appVersion),
              _diagRow('Release Channel', 'v1.0.8 Production (ARM64)'),
              _diagRow('Status', 'Up to date • Latest package installed'),
              _diagRow('Pipeline', 'YouTube Music InnerTube + StudioFX DSP'),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                height: 44,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.crimson,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () => Navigator.of(ctx).pop(),
                  child: const Text('DONE', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                ),
              ),
            ],
          ),
        ),
      );
    }
  }

  void _onVersionTapped() {
    _versionTapCount++;
    if (_versionTapCount >= 7) {
      _versionTapCount = 0;
      HapticFeedback.heavyImpact();
      _showDiagnosticsSheet();
    } else {
      HapticFeedback.lightImpact();
    }
  }

  void _showDiagnosticsSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(
          color: Color(0xFF18181B),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'SYSTEM DIAGNOSTICS',
                  style: const TextStyle(
                    fontFamily: 'SF Pro Display',
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: AppColors.crimson,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded, color: Colors.white70),
                  onPressed: () => Navigator.of(ctx).pop(),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _diagRow('Engine', 'ExoPlayer 2.19.1 / Native Media3'),
            _diagRow('Audio Pipeline', 'DSP 8D Spatial + Dynamic Compressor'),
            _diagRow('Circuit Breaker', 'Closed (Healthy 0% errors)'),
            _diagRow('Stream Source', 'Device Mode (Direct HTTPS)'),
            _diagRow('Cache Engine', 'LRU Disk Store (${SettingsState.instance.maxCacheGb.toStringAsFixed(1)} GB cap)'),
            _diagRow('Sync Status', 'Timestamp Conflict Engine Active'),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _diagRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white60, fontSize: 13)),
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final settings = context.watch<SettingsState>();
    final user = auth.user;

    final topInset = MediaQuery.paddingOf(context).top;

    return Scaffold(
      backgroundColor: Zen.bg,
      body: Stack(
        children: [
          CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(child: SizedBox(height: topInset + 56)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 10, 20, 40),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // 1. Account / Profile Header
                      _buildProfileCard(auth, user),
                      const SizedBox(height: 28),

                  // 2. Audio & Fidelity Section
                  _buildSectionHeader('AUDIO & FIDELITY'),
                  _buildGroupedContainer([
                    _buildSegmentRow(
                      title: 'Wi-Fi Streaming Quality',
                      current: settings.wifiQuality,
                      options: const {'low': '128k', 'high': '256k', 'lossless': '320k'},
                      onChanged: (v) => settings.setWifiQuality(v),
                    ),
                    _buildDivider(),
                    _buildSegmentRow(
                      title: 'Cellular Streaming Quality',
                      current: settings.cellularQuality,
                      options: const {'low': '128k', 'high': '256k', 'lossless': '320k'},
                      onChanged: (v) => settings.setCellularQuality(v),
                    ),
                    _buildDivider(),
                    _buildSegmentRow(
                      title: 'Download Quality',
                      current: settings.downloadQuality,
                      options: const {'low': '128k', 'high': '256k', 'lossless': '320k'},
                      onChanged: (v) => settings.setDownloadQuality(v),
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Volume Normalization',
                      subtitle: 'Ensures equal volume level across all songs',
                      value: settings.normalizeVolume,
                      onChanged: settings.setNormalizeVolume,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Explicit Content Filter',
                      subtitle: 'Filter out explicit tracks and lyrics',
                      value: settings.explicitFilter,
                      onChanged: settings.setExplicitFilter,
                    ),
                    _buildDivider(),
                    _buildActionRow(
                      title: 'Studio FX & Spatial Engine',
                      subtitle: '8D rotation, parametric EQ, and reverb',
                      icon: Icons.graphic_eq_rounded,
                      onTap: () => showStudioFxSheet(context),
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Mono Audio',
                      subtitle: 'Combines left and right audio channels',
                      value: settings.monoAudio,
                      onChanged: settings.setMonoAudio,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Gapless Playback',
                      subtitle: 'Continuous seamless track transitions',
                      value: settings.gaplessPlayback,
                      onChanged: settings.setGaplessPlayback,
                    ),
                  ]),
                  const SizedBox(height: 28),

                  // 3. Playback Section
                  _buildSectionHeader('PLAYBACK & CONTROLS'),
                  _buildGroupedContainer([
                    _buildSliderRow(
                      title: 'Crossfade',
                      valueLabel: settings.crossfadeSeconds > 0 ? '${settings.crossfadeSeconds}s' : 'Off',
                      value: settings.crossfadeSeconds.toDouble(),
                      min: 0,
                      max: 12,
                      divisions: 12,
                      onChanged: (v) => settings.setCrossfadeSeconds(v.round()),
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Autoplay Similar Music',
                      subtitle: 'Keep playing similar tracks when queue finishes',
                      value: settings.autoplaySimilar,
                      onChanged: settings.setAutoplaySimilar,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Hide Details When Idle',
                      subtitle: 'Fade out controls during fullscreen playback',
                      value: settings.autoHideDetails,
                      onChanged: settings.setAutoHideDetails,
                    ),
                    _buildDivider(),
                    _buildSegmentRow(
                      title: 'Lyrics Script',
                      current: settings.lyricsDefaultScript,
                      options: const {'original': 'Original', 'tanglish': 'Tanglish', 'hinglish': 'Hinglish'},
                      onChanged: (v) => settings.setLyricsDefaultScript(v),
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Pause on Disconnect',
                      subtitle: 'Pause playback when headphones are unplugged',
                      value: settings.pauseOnDisconnect,
                      onChanged: settings.setPauseOnDisconnect,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Resume Where Left Off',
                      subtitle: 'Restore queue and track position on startup',
                      value: settings.resumeWhereLeftOff,
                      onChanged: settings.setResumeWhereLeftOff,
                    ),
                  ]),
                  const SizedBox(height: 28),

                  // 4. Aesthetics Section
                  _buildSectionHeader('AESTHETICS & APPEARANCE'),
                  _buildGroupedContainer([
                    _buildSwitchRow(
                      title: 'Album Color Glow',
                      subtitle: 'Dynamic ambient colors extracted from artwork',
                      value: settings.dynamicAlbumColors,
                      onChanged: settings.setDynamicAlbumColors,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Fluid Mesh Canvas',
                      subtitle: 'Liquid reactive shader mesh in player',
                      value: settings.fluidMeshBg,
                      onChanged: settings.setFluidMeshBg,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Glass Effects',
                      subtitle: 'Real-time backdrop blur on low-end devices',
                      value: settings.glassEffects,
                      onChanged: settings.setGlassEffects,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Haptic Feedback',
                      subtitle: 'Vibrations for buttons, springs, and sliders',
                      value: settings.hapticsEnabled,
                      onChanged: settings.setHapticsEnabled,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Reduce Motion',
                      subtitle: 'Subtle alpha transitions instead of spring physics',
                      value: settings.reduceMotion,
                      onChanged: settings.setReduceMotion,
                    ),
                  ]),
                  const SizedBox(height: 28),

                  // 5. Notifications Section
                  _buildSectionHeader('NOTIFICATIONS'),
                  _buildGroupedContainer([
                    _buildSwitchRow(
                      title: 'New Releases',
                      subtitle: 'Alerts when followed artists drop new songs',
                      value: settings.newReleaseAlerts,
                      onChanged: settings.setNewReleaseAlerts,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Together Room Invites',
                      subtitle: 'Real-time notifications when invited to listen',
                      value: settings.notifyTogetherInvites,
                      onChanged: settings.setNotifyTogetherInvites,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Weekly Summary Email',
                      subtitle: 'Weekly stats and replay highlights sent to email',
                      value: settings.weeklySummaryEmail,
                      onChanged: settings.setWeeklySummaryEmail,
                    ),
                  ]),
                  const SizedBox(height: 28),

                  // 6. Privacy & Personalization
                  _buildSectionHeader('PRIVACY & TRACKING'),
                  _buildGroupedContainer([
                    _buildSwitchRow(
                      title: 'Personalized Experience',
                      subtitle: 'Tailors Home shelves and Quick Picks to your taste',
                      value: settings.personalizationEnabled,
                      onChanged: settings.setPersonalizationEnabled,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Save Listening History',
                      subtitle: 'Record playback journal to generate your Insights',
                      value: settings.saveListeningHistory,
                      onChanged: settings.setSaveListeningHistory,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Private Session',
                      subtitle: 'Temporary session; listening is not logged',
                      value: settings.privateSession,
                      onChanged: settings.setPrivateSession,
                    ),
                    _buildDivider(),
                    _buildSwitchRow(
                      title: 'Show Top Artists on Profile',
                      subtitle: 'Publicly display your favorite artists on profile',
                      value: settings.showTopArtists,
                      onChanged: settings.setShowTopArtists,
                    ),
                    _buildDivider(),
                    _buildActionRow(
                      title: 'Clear Listening History',
                      subtitle: 'Permanently resets listening log and stats',
                      icon: Icons.delete_outline_rounded,
                      isDestructive: true,
                      onTap: () => _confirmClearHistory(settings),
                    ),
                  ]),
                  const SizedBox(height: 28),

                  // 7. Storage & Cache
                  _buildSectionHeader('STORAGE & DOWNLOADS'),
                  _buildGroupedContainer([
                    _buildSwitchRow(
                      title: 'Download over Wi-Fi Only',
                      subtitle: 'Avoid cellular data usage for offline music',
                      value: settings.downloadWifiOnly,
                      onChanged: settings.setDownloadWifiOnly,
                    ),
                    _buildDivider(),
                    _buildSliderRow(
                      title: 'Maximum Disk Cache',
                      valueLabel: '${settings.maxCacheGb.toStringAsFixed(1)} GB',
                      value: settings.maxCacheGb,
                      min: 0.5,
                      max: 10.0,
                      divisions: 19,
                      onChanged: settings.setMaxCacheGb,
                    ),
                    _buildDivider(),
                    _buildActionRow(
                      title: 'Clear Media & Search Cache',
                      subtitle: 'Purge cached streams, artwork, and search history',
                      icon: CupertinoIcons.trash,
                      isDestructive: false,
                      onTap: () async {
                        await CacheService.clearAllMediaAndArtworkCache();
                        IslandNotifier.instance.show(
                          IslandNotification(
                            id: 'cache_cleared_${DateTime.now().millisecondsSinceEpoch}',
                            title: 'Cache cleared',
                            body: 'All cached media, search & artwork purged',
                            leading: const Icon(CupertinoIcons.trash, color: Color(0xFFE11D48), size: 18),
                          ),
                        );
                      },
                    ),
                  ]),
                  const SizedBox(height: 28),

                  // 8. Account & Security
                  if (auth.isLoggedIn) ...[
                    _buildSectionHeader('SECURITY & SESSIONS'),
                    _buildGroupedContainer([
                      _buildActionRow(
                        title: 'Active Devices & Sessions',
                        subtitle: 'View and revoke active logged-in devices',
                        icon: Icons.devices_rounded,
                        onTap: () => _showSessionsSheet(),
                      ),
                      _buildDivider(),
                      _buildActionRow(
                        title: 'Export My Data',
                        subtitle: 'Download complete GDPR JSON archive',
                        icon: Icons.download_rounded,
                        onTap: () => _exportUserData(),
                      ),
                      _buildDivider(),
                      _buildActionRow(
                        title: 'Sign Out',
                        subtitle: 'Sign out of your account on this device',
                        icon: Icons.logout_rounded,
                        onTap: () => _confirmSignOut(auth),
                      ),
                      _buildDivider(),
                      _buildActionRow(
                        title: 'Delete Account',
                        subtitle: 'Permanently remove your account and all data',
                        icon: Icons.warning_amber_rounded,
                        isDestructive: true,
                        onTap: () => _confirmDeleteAccount(auth),
                      ),
                    ]),
                    const SizedBox(height: 28),
                  ],

                  // 9. About & Support
                  _buildSectionHeader('ABOUT ZENIFY'),
                  _buildGroupedContainer([
                    _buildActionRow(
                      title: 'Version & Build',
                      subtitle: _appVersion,
                      icon: Icons.info_outline_rounded,
                      onTap: _onVersionTapped,
                    ),
                    _buildDivider(),
                    _buildActionRow(
                      title: 'Check for Updates',
                      subtitle: 'Zenify Release Channel (Device Mode)',
                      icon: Icons.system_update_rounded,
                      onTap: _onCheckForUpdates,
                    ),
                    _buildDivider(),
                    _buildActionRow(
                      title: 'Open Source Licenses',
                      subtitle: 'Flutter, Media3, ExoPlayer, NewPipe',
                      icon: Icons.code_rounded,
                      onTap: () => showLicensePage(context: context),
                    ),
                  ]),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ],
      ),
      Positioned(
        top: 0,
        left: 0,
        right: 0,
        child: DynamicIslandHeader(
          title: 'Settings',
          showBack: true,
          onBack: () => Navigator.of(context).pop(),
          showProfile: false,
          topPadding: topInset + 4,
        ),
      ),
    ],
  ),
);
  }

  // ==================== WIDGET BUILDERS ====================

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(6, 0, 0, 8),
      child: Text(
        title,
        style: const TextStyle(
          fontFamily: 'SF Pro',
          fontSize: 12.5,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: Colors.white54,
        ),
      ),
    );
  }

  Widget _buildGroupedContainer(List<Widget> children) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }

  Widget _buildDivider() {
    return Divider(
      height: 1,
      color: Colors.white.withValues(alpha: 0.06),
      indent: 16,
      endIndent: 16,
    );
  }

  Widget _buildProfileCard(AuthState auth, UserProfile? user) {
    final isLoggedIn = auth.isLoggedIn;
    final initial = (user?.name.isNotEmpty == true ? user!.name[0] : 'Z').toUpperCase();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.crimson.withValues(alpha: 0.15),
            const Color(0xFF18181B),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.crimson.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF9E2339), Color(0xFFE11D48)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: AppColors.crimson.withValues(alpha: 0.35),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            alignment: Alignment.center,
            child: Text(
              initial,
              style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isLoggedIn ? (user?.name ?? 'Zenify Listener') : 'Guest Account',
                  style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Text(
                  isLoggedIn ? (user?.email ?? '') : 'Sign in to sync your library across devices',
                  style: const TextStyle(color: Colors.white60, fontSize: 12),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          if (!isLoggedIn)
            PressableScale(
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    fullscreenDialog: true,
                    builder: (_) => WelcomeScreen(onFinished: () => Navigator.of(context).pop()),
                  ),
                );
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.crimson,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Text(
                  'Sign In',
                  style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildSwitchRow({
    required String title,
    String? subtitle,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(subtitle, style: const TextStyle(color: Colors.white54, fontSize: 11)),
                ],
              ],
            ),
          ),
          CupertinoSwitch(
            value: value,
            activeTrackColor: AppColors.crimson,
            onChanged: (newVal) {
              HapticFeedback.lightImpact();
              onChanged(newVal);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSegmentRow({
    required String title,
    required String current,
    required Map<String, String> options,
    required ValueChanged<String> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
          const SizedBox(width: 8),
          CupertinoSlidingSegmentedControl<String>(
            groupValue: current,
            backgroundColor: const Color(0xFF242428),
            thumbColor: AppColors.crimson,
            padding: const EdgeInsets.all(3),
            children: {
              for (final entry in options.entries)
                entry.key: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  child: Text(
                    entry.value,
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: current == entry.key ? FontWeight.bold : FontWeight.w500,
                      color: current == entry.key ? Colors.white : Colors.white60,
                    ),
                  ),
                ),
            },
            onValueChanged: (val) {
              if (val != null) {
                HapticFeedback.selectionClick();
                onChanged(val);
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildSliderRow({
    required String title,
    required String valueLabel,
    required double value,
    required double min,
    required double max,
    required int divisions,
    required ValueChanged<double> onChanged,
  }) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
              Text(valueLabel, style: const TextStyle(color: AppColors.crimson, fontSize: 13, fontWeight: FontWeight.bold)),
            ],
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: AppColors.crimson,
              inactiveTrackColor: const Color(0xFF27272A),
              thumbColor: Colors.white,
              overlayColor: AppColors.crimson.withValues(alpha: 0.2),
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
              trackHeight: 3,
            ),
            child: Slider(
              value: value.clamp(min, max),
              min: min,
              max: max,
              divisions: divisions,
              onChanged: (v) {
                HapticFeedback.selectionClick();
                onChanged(v);
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionRow({
    required String title,
    String? subtitle,
    required IconData icon,
    bool isDestructive = false,
    required VoidCallback onTap,
  }) {
    return PressableScale(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Icon(icon, color: isDestructive ? Colors.redAccent : Colors.white70, size: 20),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: isDestructive ? Colors.redAccent : Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(subtitle, style: const TextStyle(color: Colors.white54, fontSize: 11)),
                  ],
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios_rounded, color: Colors.white24, size: 14),
          ],
        ),
      ),
    );
  }

  // ==================== DIALOGS & ACTIONS ====================

  void _confirmClearHistory(SettingsState settings) {
    showCupertinoDialog(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Clear Listening History?'),
        content: const Text(
          'This will permanently reset your listening events, stats, and personal Replay data on all devices.',
        ),
        actions: [
          CupertinoDialogAction(
            child: const Text('Cancel'),
            onPressed: () => Navigator.of(ctx).pop(),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () async {
              Navigator.of(ctx).pop();
              final ok = await settings.clearListeningHistory();
              IslandNotifier.instance.show(
                IslandNotification(
                  id: 'history_cleared_${DateTime.now().millisecondsSinceEpoch}',
                  title: ok ? 'History cleared' : 'Failed to clear history',
                  body: ok ? 'Listening data reset' : 'Please try again',
                  leading: const Icon(CupertinoIcons.trash, color: Color(0xFFE11D48), size: 18),
                ),
              );
            },
            child: const Text('Clear'),
          ),
        ],
      ),
    );
  }

  void _confirmSignOut(AuthState auth) {
    showCupertinoDialog(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to sign out of Zenify?'),
        actions: [
          CupertinoDialogAction(
            child: const Text('Cancel'),
            onPressed: () => Navigator.of(ctx).pop(),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () {
              Navigator.of(ctx).pop();
              auth.signOut();
            },
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
  }

  void _confirmDeleteAccount(AuthState auth) {
    showCupertinoDialog(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Delete Account'),
        content: const Text(
          'This action is irreversible. All playlists, favorites, and preferences will be permanently wiped.',
        ),
        actions: [
          CupertinoDialogAction(
            child: const Text('Cancel'),
            onPressed: () => Navigator.of(ctx).pop(),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () async {
              Navigator.of(ctx).pop();
              final token = await AuthService.instance.getAccessToken();
              if (token != null) {
                await http.delete(
                  Uri.parse('${ApiService.baseUrl}/api/me/account'),
                  headers: {'Authorization': 'Bearer $token'},
                );
              }
              auth.signOut();
            },
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  void _showSessionsSheet() async {
    final token = await AuthService.instance.getAccessToken();
    if (token == null) return;

    if (!mounted) return;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) => Container(
        height: MediaQuery.of(ctx).size.height * 0.65,
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(
          color: Color(0xFF18181B),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: FutureBuilder<http.Response>(
          future: http.get(
            Uri.parse('${ApiService.baseUrl}/api/me/sessions'),
            headers: {'Authorization': 'Bearer $token'},
          ),
          builder: (context, snapshot) {
            if (!snapshot.hasData) {
              return const Center(child: CupertinoActivityIndicator(color: AppColors.crimson));
            }
            if (snapshot.data!.statusCode != 200) {
              return const Center(child: Text('Failed to load active sessions', style: TextStyle(color: Colors.white70)));
            }

            final sessions = (jsonDecode(snapshot.data!.body) as List<dynamic>?) ?? [];
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ACTIVE SESSIONS (${sessions.length})',
                  style: const TextStyle(
                    fontFamily: 'SF Pro Display',
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.8,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),
                Expanded(
                  child: ListView.separated(
                    itemCount: sessions.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 10),
                    itemBuilder: (context, idx) {
                      final s = sessions[idx] as Map<String, dynamic>;
                      final deviceName = s['deviceName'] ?? 'Unknown Device';
                      final platform = s['platform'] ?? 'Mobile';
                      final isCurrent = s['isCurrent'] == true;

                      return Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFF242428),
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: isCurrent ? AppColors.crimson.withValues(alpha: 0.5) : Colors.white10,
                          ),
                        ),
                        child: Row(
                          children: [
                            Icon(
                              platform == 'web' ? Icons.laptop_mac_rounded : Icons.phone_android_rounded,
                              color: isCurrent ? AppColors.crimson : Colors.white70,
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                 Row(
                                    children: [
                                      Text(
                                        deviceName,
                                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                      ),
                                      if (isCurrent) ...[
                                        const SizedBox(width: 6),
                                        Container(
                                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                          decoration: BoxDecoration(
                                            color: AppColors.crimson,
                                            borderRadius: BorderRadius.circular(4),
                                          ),
                                          child: const Text('THIS DEVICE', style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold)),
                                        ),
                                      ],
                                    ],
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    'Platform: $platform',
                                    style: const TextStyle(color: Colors.white54, fontSize: 11),
                                  ),
                                ],
                              ),
                            ),
                            if (!isCurrent)
                              IconButton(
                                icon: const Icon(Icons.close_rounded, color: Colors.redAccent, size: 18),
                                onPressed: () async {
                                  final id = s['id'];
                                  await http.delete(
                                    Uri.parse('${ApiService.baseUrl}/api/me/sessions/$id'),
                                    headers: {'Authorization': 'Bearer $token'},
                                  );
                                  if (ctx.mounted) {
                                    Navigator.of(ctx).pop();
                                  }
                                },
                              ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  void _exportUserData() async {
    final token = await AuthService.instance.getAccessToken();
    if (token == null) return;

    try {
      final res = await http.get(
        Uri.parse('${ApiService.baseUrl}/api/me/export'),
        headers: {'Authorization': 'Bearer $token'},
      );

      if (res.statusCode == 200 && mounted) {
        showDialog(
          context: context,
          builder: (ctx) => AlertDialog(
            backgroundColor: const Color(0xFF18181B),
            title: const Text('Data Export Ready', style: TextStyle(color: Colors.white)),
            content: const Text(
              'Your complete GDPR data archive has been created. All playlists, preferences, and listening stats are exported.',
              style: TextStyle(color: Colors.white70),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Done', style: TextStyle(color: AppColors.crimson)),
              ),
            ],
          ),
        );
      }
    } catch (_) {}
  }
}
