import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart' show appleToast, Avatar;
import '../../design_system/apple/apple_music_kit.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../services/auth_state.dart';
import '../../services/cache_service.dart';
import '../../services/country_service.dart';
import '../../services/dock_visibility.dart';
import '../../services/download_service.dart';
import '../../services/glass_engine.dart';
import '../../services/settings_service.dart';
import '../../services/update_service.dart';
import '../../services/user_preferences_service.dart';
import '../auth/welcome_screen.dart';
import '../player/studio_fx_sheet.dart';
import '../profile/profile_edit_sheets.dart';
import '../profile/profile_screen.dart';
import 'glass_customizer_screen.dart';

class _QualityOption {
  const _QualityOption({
    required this.code,
    required this.title,
    required this.subtitle,
    required this.badge,
    required this.points,
  });

  final String code;
  final String title;
  final String subtitle;
  final String badge;
  final List<String> points;
}

const _audioQualityOptions = <_QualityOption>[
  _QualityOption(
    code: 'high',
    title: 'High',
    subtitle: '160 kbps Opus • Studio Master',
    badge: '160 kbps',
    points: [
      'Format: 160 kbps Opus / 320 kbps stream',
      'File Size: ~3.8 MB – 4.2 MB per song',
      'Network: Best on Wi-Fi & 4G / 5G',
      'Experience: Pristine studio sound & dynamic range',
    ],
  ),
  _QualityOption(
    code: 'medium',
    title: 'Medium',
    subtitle: '128 kbps AAC • Balanced',
    badge: '128 kbps',
    points: [
      'Format: 128 kbps AAC / Opus',
      'File Size: ~2.8 MB – 3.2 MB per song',
      'Network: Smooth on all cellular networks',
      'Experience: Clean clarity with balanced data usage',
    ],
  ),
  _QualityOption(
    code: 'low',
    title: 'Data Saver',
    subtitle: '~70 kbps Opus • Fast Streaming',
    badge: '~70 kbps',
    points: [
      'Format: ~70 kbps Opus stream',
      'File Size: ~1.6 MB – 2.0 MB per song',
      'Network: 50%+ data savings on 3G / 4G',
      'Experience: Smooth playback on limited data plans',
    ],
  ),
  _QualityOption(
    code: 'ultra_low',
    title: 'Ultra Data Saver',
    subtitle: '~50 kbps Opus • Minimal Data',
    badge: '~50 kbps',
    points: [
      'Format: ~50 kbps Opus stream',
      'File Size: ~1.1 MB – 1.4 MB per song',
      'Network: Plays reliably in weak network areas',
      'Experience: Maximum compression for emergency listening',
    ],
  ),
];

const _imageQualityOptions = <_QualityOption>[
  _QualityOption(
    code: 'high',
    title: 'High',
    subtitle: '1000px HD • Retina Crisp',
    badge: '1000px HD',
    points: [
      'Resolution: 1000×1000 HD cover art',
      'File Size: ~180 KB – 320 KB per image',
      'Network: Best on Wi-Fi & fast mobile data',
      'Experience: Razor-sharp on high-resolution displays',
    ],
  ),
  _QualityOption(
    code: 'medium',
    title: 'Medium',
    subtitle: '540px • Standard HD',
    badge: '540px',
    points: [
      'Resolution: 540×540 standard cover art',
      'File Size: ~70 KB – 120 KB per image',
      'Network: Fast loading on standard mobile data',
      'Experience: Clean clarity with optimized caching',
    ],
  ),
  _QualityOption(
    code: 'low',
    title: 'Data Saver',
    subtitle: '250px • Compact',
    badge: '250px',
    points: [
      'Resolution: 250×250 compact thumbnail',
      'File Size: ~20 KB – 40 KB per image',
      'Network: Maximum data savings on slow connections',
      'Experience: Lightweight image for fastest scrolling',
    ],
  ),
];

String _audioQualityLabel(String code) => switch (code) {
  'high' => 'High',
  'medium' => 'Medium',
  'low' => 'Data Saver',
  'ultra_low' => 'Ultra Data Saver',
  _ => 'High',
};

String _imageQualityLabel(String code) => switch (code) {
  'high' => 'High',
  'medium' => 'Medium',
  'low' => 'Data Saver',
  _ => 'Medium',
};

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> with HideDocksMixin {
  @override
  bool get hideMiniPlayerWhileActive => true;

  int _versionTaps = 0;
  String _version = 'v1.0.9 (Build 13)';

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform()
        .then((info) {
          if (mounted) {
            setState(
              () => _version = 'v${info.version} (Build ${info.buildNumber})',
            );
          }
        })
        .catchError((_) {});
  }

  Future<void> _checkForUpdates() async {
    AM.impact();
    appleToast(
      context,
      'Checking for updates…',
      icon: CupertinoIcons.cloud_download,
    );
    final info = await UpdateService.instance.checkForUpdate(silent: false);
    if (!mounted) return;
    if (info != null && info.hasUpdate) {
      UpdateService.instance.showUpdateSheet(context, info);
      return;
    }
    await ZenDropdown.show(
      context: context,
      title: 'Up to Date',
      subtitle: 'Zenify release channel',
      items: [
        ZenDropdownItem(
          title: 'Current Build',
          subtitle: _version,
          icon: CupertinoIcons.checkmark_seal_fill,
        ),
        const ZenDropdownItem(
          title: 'Channel',
          subtitle: 'Production Stable',
          icon: CupertinoIcons.sparkles,
        ),
        const ZenDropdownItem(
          title: 'Status',
          subtitle: 'Latest version installed',
          icon: CupertinoIcons.checkmark_alt,
        ),
      ],
    );
  }

  void _onVersionTap() {
    _versionTaps++;
    if (_versionTaps >= 7) {
      _versionTaps = 0;
      HapticFeedback.heavyImpact();
      ZenDropdown.show(
        context: context,
        title: 'Diagnostics',
        subtitle: 'Audio & cache engine',
        items: [
          const ZenDropdownItem(
            title: 'Engine',
            subtitle: 'Media3 / ExoPlayer',
            icon: CupertinoIcons.gear,
          ),
          const ZenDropdownItem(
            title: 'Pipeline',
            subtitle: 'StudioFX 8D & EQ',
            icon: CupertinoIcons.waveform,
          ),
          ZenDropdownItem(
            title: 'Cache Cap',
            subtitle:
                '${SettingsState.instance.maxCacheGb.toStringAsFixed(2)} GB',
            icon: CupertinoIcons.archivebox,
          ),
          ZenDropdownItem(
            title: 'Glass Style',
            subtitle: GlassEngine.instance.presetName,
            icon: CupertinoIcons.circle_grid_hex,
          ),
        ],
      );
    } else {
      AM.tick();
    }
  }

  void _showQualityInfoPopup(
    BuildContext context,
    _QualityOption opt, {
    required bool isAudio,
  }) {
    HapticFeedback.lightImpact();
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Quality Info',
      barrierColor: Colors.black.withValues(alpha: 0.65),
      transitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (ctx, anim1, anim2) {
        return Center(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(
              width: math.min(MediaQuery.sizeOf(ctx).width - 48, 330),
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 22),
              decoration: BoxDecoration(
                color: const Color(0xF21C1C1E),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.14),
                  width: 0.8,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.50),
                    blurRadius: 30,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Material(
                color: Colors.transparent,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: AM.rose.withValues(alpha: 0.14),
                            border: Border.all(
                              color: AM.rose.withValues(alpha: 0.35),
                              width: 1,
                            ),
                          ),
                          alignment: Alignment.center,
                          child: Icon(
                            isAudio
                                ? CupertinoIcons.waveform
                                : CupertinoIcons.photo,
                            size: 17,
                            color: AM.rose,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                opt.title,
                                style: const TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 17,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                              Text(
                                opt.badge,
                                style: TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 12,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.white.withValues(alpha: 0.55),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.05),
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.08),
                          width: 0.6,
                        ),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (int i = 0; i < opt.points.length; i++) ...[
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  '• ',
                                  style: TextStyle(
                                    color: AM.rose,
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                Expanded(
                                  child: Text(
                                    opt.points[i],
                                    style: const TextStyle(
                                      fontFamily: 'SF Pro',
                                      fontSize: 13,
                                      height: 1.35,
                                      color: Colors.white,
                                      fontWeight: FontWeight.w400,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            if (i < opt.points.length - 1)
                              const SizedBox(height: 8),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      height: 42,
                      child: CupertinoButton(
                        padding: EdgeInsets.zero,
                        color: const Color(0xFF2C2C2E),
                        borderRadius: BorderRadius.circular(14),
                        onPressed: () {
                          HapticFeedback.selectionClick();
                          Navigator.of(ctx).pop();
                        },
                        child: const Text(
                          'Got It',
                          style: TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
      transitionBuilder: (ctx, anim1, anim2, child) {
        return FadeTransition(
          opacity: CurvedAnimation(parent: anim1, curve: Curves.easeOutCubic),
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.94, end: 1.0).animate(
              CurvedAnimation(parent: anim1, curve: Curves.easeOutCubic),
            ),
            child: child,
          ),
        );
      },
    );
  }

  Widget _buildQualityOptionTile({
    required BuildContext context,
    required _QualityOption option,
    required bool isSelected,
    required bool isAudio,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: isSelected
                ? Colors.white.withValues(alpha: 0.08)
                : Colors.white.withValues(alpha: 0.03),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isSelected
                  ? AM.rose.withValues(alpha: 0.50)
                  : Colors.white.withValues(alpha: 0.08),
              width: isSelected ? 1.2 : 0.8,
            ),
          ),
          child: Row(
            children: [
              Icon(
                isSelected
                    ? CupertinoIcons.checkmark_circle_fill
                    : CupertinoIcons.circle,
                size: 20,
                color: isSelected ? AM.rose : Colors.white30,
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      option.title,
                      style: TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 16,
                        fontWeight: isSelected
                            ? FontWeight.w700
                            : FontWeight.w600,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      option.subtitle,
                      style: TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 12,
                        color: Colors.white.withValues(alpha: 0.55),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () =>
                    _showQualityInfoPopup(context, option, isAudio: isAudio),
                child: Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.08),
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.20),
                      width: 0.9,
                    ),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    CupertinoIcons.info,
                    size: 15,
                    color: Colors.white70,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _showQualityPickerSheet({
    required BuildContext context,
    required String title,
    required String subtitle,
    required List<_QualityOption> options,
    required String currentCode,
    required bool isAudio,
    required ValueChanged<String> onSelected,
  }) {
    HapticFeedback.lightImpact();
    return DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        backgroundColor: Colors.transparent,
        barrierColor: Colors.black.withValues(alpha: 0.55),
        isScrollControlled: true,
        enableDrag: true,
        builder: (ctx) {
          final safeBottom = MediaQuery.paddingOf(ctx).bottom;
          return BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 25, sigmaY: 25),
            child: Container(
              decoration: BoxDecoration(
                color: const Color(0xF21C1C1E),
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(30),
                ),
                border: Border(
                  top: BorderSide(
                    color: Colors.white.withValues(alpha: 0.14),
                    width: 0.6,
                  ),
                ),
              ),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Grabber
                    Center(
                      child: Container(
                        width: 36,
                        height: 4.5,
                        margin: const EdgeInsets.only(top: 10, bottom: 14),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.22),
                          borderRadius: BorderRadius.circular(2.5),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 14),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: const TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 18,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: -0.3,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                subtitle,
                                style: TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 13,
                                  color: Colors.white.withValues(alpha: 0.55),
                                ),
                              ),
                            ],
                          ),
                          PressableScale(
                            onTap: () => Navigator.pop(ctx),
                            child: Container(
                              padding: const EdgeInsets.all(5),
                              decoration: const ShapeDecoration(
                                shape: CircleBorder(),
                                color: Color(0x1FFFFFFF),
                              ),
                              child: const Icon(
                                Icons.close_rounded,
                                size: 18,
                                color: Colors.white70,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    Divider(
                      height: 0.5,
                      thickness: 0.5,
                      color: Colors.white.withValues(alpha: 0.12),
                    ),
                    Padding(
                      padding: EdgeInsets.fromLTRB(
                        16,
                        12,
                        16,
                        math.max(16, safeBottom + 12),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          for (int i = 0; i < options.length; i++) ...[
                            _buildQualityOptionTile(
                              context: ctx,
                              option: options[i],
                              isSelected: options[i].code == currentCode,
                              isAudio: isAudio,
                              onTap: () {
                                AM.impact();
                                onSelected(options[i].code);
                                Navigator.pop(ctx);
                              },
                            ),
                            if (i < options.length - 1)
                              const SizedBox(height: 8),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _pickAudioQuality(SettingsState s) async {
    await _showQualityPickerSheet(
      context: context,
      title: 'Audio Quality',
      subtitle: 'Streaming and download fidelity',
      options: _audioQualityOptions,
      currentCode: s.audioQuality,
      isAudio: true,
      onSelected: (code) {
        s.setAudioQuality(code);
        appleToast(
          context,
          'Audio quality set to ${_audioQualityLabel(code)}',
          icon: CupertinoIcons.waveform,
        );
      },
    );
  }

  Future<void> _pickImageQuality(SettingsState s) async {
    await _showQualityPickerSheet(
      context: context,
      title: 'Artwork Quality',
      subtitle: 'Cover art resolution and cache usage',
      options: _imageQualityOptions,
      currentCode: s.imageQuality,
      isAudio: false,
      onSelected: (code) {
        s.setImageQuality(code);
        appleToast(
          context,
          'Artwork quality set to ${_imageQualityLabel(code)}',
          icon: CupertinoIcons.photo,
        );
      },
    );
  }

  Future<void> _pickDownloadAudioQuality(SettingsState s) async {
    await _showQualityPickerSheet(
      context: context,
      title: 'Download Audio Quality',
      subtitle: 'Audio fidelity for offline downloads',
      options: _audioQualityOptions,
      currentCode: s.downloadAudioQuality,
      isAudio: true,
      onSelected: (code) {
        s.setDownloadAudioQuality(code);
        appleToast(
          context,
          'Download audio quality set to ${_audioQualityLabel(code)}',
          icon: CupertinoIcons.arrow_down_circle,
        );
      },
    );
  }

  Future<void> _pickDownloadImageQuality(SettingsState s) async {
    await _showQualityPickerSheet(
      context: context,
      title: 'Download Artwork Quality',
      subtitle: 'Cover art resolution for offline downloads',
      options: _imageQualityOptions,
      currentCode: s.downloadImageQuality,
      isAudio: false,
      onSelected: (code) {
        s.setDownloadImageQuality(code);
        appleToast(
          context,
          'Download artwork quality set to ${_imageQualityLabel(code)}',
          icon: CupertinoIcons.photo,
        );
      },
    );
  }

  void _showStorageManagement(BuildContext context) {
    final downloads = DownloadService.instance;
    ZenDropdown.show(
      context: context,
      title: 'Storage Management',
      subtitle: 'Offline tracks and streaming cache usage',
      items: [
        ZenDropdownItem(
          title: 'Downloaded Songs',
          subtitle:
              '${downloads.downloadedCount} ${downloads.downloadedCount == 1 ? 'song' : 'songs'} (${downloads.formattedTotalSize})',
          icon: CupertinoIcons.arrow_down_circle,
        ),
        const ZenDropdownItem(
          title: 'Streaming & Artwork Cache',
          subtitle: 'Temporary audio, lyrics and artwork files',
          icon: CupertinoIcons.archivebox,
        ),
        ZenDropdownItem(
          title: 'Clear Temporary Cache',
          subtitle: 'Keeps downloaded songs and playlists safe',
          icon: CupertinoIcons.trash,
          isDestructive: true,
          onTap: () async {
            await _confirmClearCache();
          },
        ),
      ],
    );
  }

  Future<void> _confirmClearCache() async {
    final ok = await ZenDropdown.showConfirmSheet(
      context: context,
      title: 'Clear Cache',
      message:
          'This clears temporary streaming cache, cached artwork, and cached lyrics. Your downloaded offline music, playlists, and account data will not be affected.',
      confirmLabel: 'Clear Cache',
      isDestructive: true,
      icon: CupertinoIcons.trash,
    );
    if (ok && mounted) {
      await CacheService.clearAllMediaAndArtworkCache();
      if (mounted) {
        appleToast(
          context,
          'Cache cleared',
          icon: CupertinoIcons.checkmark_circle_fill,
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final s = context.watch<SettingsState>();
    final user = auth.user;
    final name = UserPreferencesService.resolveDisplayName(
      accountName: user?.name,
      displayName: user?.displayName,
      username: user?.username,
    );

    return AMPage(
      title: 'Settings',
      children: [
        // 1. Account
        AMSection(
          children: [
            AMRow(
              leading: Avatar(name: name, size: 46),
              title: name,
              subtitle: auth.isLoggedIn
                  ? (user?.email ?? 'Signed in')
                  : 'Sign in to sync your library',
              chevron: auth.isLoggedIn,
              trailing: auth.isLoggedIn
                  ? null
                  : const Text(
                      'Sign In',
                      style: TextStyle(
                        fontFamily: 'SF Pro',
                        color: AM.rose,
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
              onTap: () => Navigator.of(context).push(
                auth.isLoggedIn
                    ? CupertinoPageRoute<void>(
                        builder: (_) => const ProfileScreen(fromSettings: true),
                      )
                    : CupertinoPageRoute<void>(
                        fullscreenDialog: true,
                        builder: (_) => WelcomeScreen(
                          onFinished: () => Navigator.of(context).pop(),
                        ),
                      ),
              ),
            ),
          ],
        ),

        // 2. Audio
        AMSection(
          header: 'Audio',
          footer:
              'Volume normalization keeps loudness consistent between songs.',
          children: [
            AMRow(
              title: 'Audio Quality',
              value: _audioQualityLabel(s.audioQuality),
              chevron: true,
              onTap: () => _pickAudioQuality(s),
            ),
            AMRow(
              title: 'Studio FX & Spatial Audio',
              subtitle: '8D rotation, parametric EQ and reverb',
              chevron: true,
              onTap: () => showStudioFxSheet(context),
            ),
            AMSwitchRow(
              title: 'Volume Normalization',
              value: s.normalizeVolume,
              onChanged: s.setNormalizeVolume,
            ),
          ],
        ),

        // 3. Playback
        AMSection(
          header: 'Playback',
          children: [
            AMSliderRow(
              title: 'Crossfade',
              valueLabel: s.crossfadeSeconds > 0
                  ? '${s.crossfadeSeconds}s'
                  : 'Off',
              value: s.crossfadeSeconds.toDouble(),
              max: 12,
              divisions: 12,
              onChanged: (v) => s.setCrossfadeSeconds(v.round()),
            ),
            AMSwitchRow(
              title: 'Gapless Playback',
              subtitle: 'Seamless transitions between tracks',
              value: s.gaplessPlayback,
              onChanged: s.setGaplessPlayback,
            ),
            AMSwitchRow(
              title: 'Autoplay Similar Music',
              subtitle: 'Keep playing similar songs when the queue ends',
              value: s.autoplaySimilar,
              onChanged: s.setAutoplaySimilar,
            ),
            AMSwitchRow(
              title: 'Explicit Content Filter',
              value: s.explicitFilter,
              onChanged: s.setExplicitFilter,
            ),
          ],
        ),

        // 4. Appearance
        AMSection(
          header: 'Appearance & Media',
          children: [
            AMRow(
              title: 'Artwork Quality',
              value: _imageQualityLabel(s.imageQuality),
              chevron: true,
              onTap: () => _pickImageQuality(s),
            ),
            AMRow(
              title: 'Glass Customizer',
              subtitle: 'Material, blur, prism and motion',
              value: GlassEngine.instance.presetName,
              chevron: true,
              onTap: () => Navigator.of(context)
                  .push(
                    CupertinoPageRoute<void>(
                      builder: (_) => const GlassCustomizerScreen(),
                    ),
                  )
                  .then((_) {
                    if (mounted) setState(() {});
                  }),
            ),
            AMSwitchRow(
              title: 'Fluid Mesh Canvas',
              subtitle: 'Reactive player backdrop',
              value: s.fluidMeshBg,
              onChanged: s.setFluidMeshBg,
            ),
            AMSwitchRow(
              title: 'Full-Bleed Artwork Player',
              subtitle: 'Edge-to-edge poster artwork with ambient fade',
              value: s.fullBleedArtworkPlayer,
              onChanged: s.setFullBleedArtworkPlayer,
            ),
          ],
        ),

        // 5. Music Preferences & Taste
        ValueListenableBuilder<CountryInfo>(
          valueListenable: CountryService.instance.countryNotifier,
          builder: (context, country, _) {
            return ValueListenableBuilder<OnboardingPrefs?>(
              valueListenable: UserPreferencesService.instance.prefsNotifier,
              builder: (context, prefs, _) {
                final langs = prefs?.languages ?? const [];
                final genres = prefs?.genres ?? const [];
                final artists = prefs?.favoriteArtists ?? const [];
                return AMSection(
                  header: 'Music Preferences & Taste',
                  footer:
                      'Personalizes your Home and Explore feeds across countries, languages, genres, and favorite artists.',
                  children: [
                    AMRow(
                      title: 'Country / Region',
                      value: '${country.flag}  ${country.name}',
                      chevron: true,
                      onTap: () => showRegionPickerSheet(context),
                    ),
                    AMRow(
                      title: 'Languages',
                      value: langs.isNotEmpty ? langs.join(', ') : 'All',
                      chevron: true,
                      onTap: () => showLanguagesPickerSheet(context),
                    ),
                    AMRow(
                      title: 'Genres & Vibes',
                      value: genres.isNotEmpty
                          ? genres.take(3).join(', ')
                          : 'All',
                      chevron: true,
                      onTap: () => showGenresPickerSheet(context),
                    ),
                    AMRow(
                      title: 'Favorite Artists',
                      value: artists.isNotEmpty
                          ? '${artists.length} selected'
                          : 'None',
                      chevron: true,
                      onTap: () => showArtistsPickerSheet(context),
                    ),
                  ],
                );
              },
            );
          },
        ),

        // 6. Accessibility
        AMSection(
          header: 'Accessibility',
          footer:
              'Reduce Motion replaces springs and glass animation with calm fades.',
          children: [
            AMSwitchRow(
              title: 'Haptic Feedback',
              subtitle: 'Taps on buttons, switches and sliders',
              value: s.hapticsEnabled,
              onChanged: s.setHapticsEnabled,
            ),
            AMSwitchRow(
              title: 'Reduce Motion',
              value: s.reduceMotion,
              onChanged: s.setReduceMotion,
            ),
            AMSwitchRow(
              title: 'Mono Audio',
              subtitle: 'Combine left and right channels',
              value: s.monoAudio,
              onChanged: s.setMonoAudio,
            ),
          ],
        ),

        // 6. Downloads
        AMSection(
          header: 'Downloads',
          footer:
              'Choose audio and artwork fidelity for offline songs. High quality downloads provide crystal clear sound with lightweight storage.',
          children: [
            AMRow(
              title: 'Download Audio Quality',
              subtitle: _audioQualityLabel(s.downloadAudioQuality),
              chevron: true,
              onTap: () => _pickDownloadAudioQuality(s),
            ),
            AMRow(
              title: 'Download Artwork Quality',
              subtitle: _imageQualityLabel(s.downloadImageQuality),
              chevron: true,
              onTap: () => _pickDownloadImageQuality(s),
            ),
            AMSwitchRow(
              title: 'Download on Wi-Fi Only',
              value: s.downloadWifiOnly,
              onChanged: s.setDownloadWifiOnly,
            ),
            AMRow(
              title: 'Storage Management',
              subtitle: 'Offline tracks and streaming cache usage',
              chevron: true,
              onTap: () => _showStorageManagement(context),
            ),
            AMRow(
              title: 'Clear Cache',
              subtitle: 'Temporary audio, lyrics and artwork',
              titleColor: AM.rose,
              onTap: _confirmClearCache,
            ),
          ],
        ),

        // 7. Notifications
        AMSection(
          header: 'Notifications',
          children: [
            AMSwitchRow(
              title: 'New Releases',
              subtitle: 'From your favorite artists',
              value: s.newReleaseAlerts,
              onChanged: s.setNewReleaseAlerts,
            ),
            AMSwitchRow(
              title: 'Room Together Invites',
              value: s.notifyTogetherInvites,
              onChanged: s.setNotifyTogetherInvites,
            ),
          ],
        ),

        // 8. Privacy
        AMSection(
          header: 'Privacy',
          footer:
              'Private sessions allow listening without updating history or public status.',
          children: [
            AMSwitchRow(
              title: 'Private Session',
              subtitle: 'Listen without logging plays',
              value: s.privateSession,
              onChanged: s.setPrivateSession,
            ),
            AMSwitchRow(
              title: 'Listening History',
              subtitle: 'Builds your Replay stats and taste profile',
              value: s.saveListeningHistory,
              onChanged: s.setSaveListeningHistory,
            ),
          ],
        ),

        // 9. About
        AMSection(
          header: 'About',
          children: [
            AMRow(title: 'Version', value: _version, onTap: _onVersionTap),
            AMRow(
              title: 'Check for Updates',
              chevron: true,
              onTap: _checkForUpdates,
            ),
            AMRow(
              title: 'Open Source Licenses',
              chevron: true,
              onTap: () => showLicensePage(context: context),
            ),
          ],
        ),
      ],
    );
  }
}
