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
import 'crossfade_style_section.dart';
import 'glass_customizer_screen.dart';

class _QualityOption {
  const _QualityOption({
    required this.code,
    required this.title,
    required this.subtitle,
    required this.badge,
    required this.points,
    this.isRecommended = false,
  });

  final String code;
  final String title;
  final String subtitle;
  final String badge;
  final List<String> points;
  final bool isRecommended;
}

const _audioQualityOptions = <_QualityOption>[
  _QualityOption(
    code: 'high',
    title: 'High',
    subtitle: '160 kbps Opus • Studio Master',
    badge: '160 kbps',
    isRecommended: true,
    points: [
      'Format: 160 kbps Opus / 320 kbps stream',
      'Data Usage: ~3.8 MB – 4.5 MB per 4-min song',
      'Device Fit: Recommended for all phones & headphones',
      'Network: Pristine studio sound on Wi-Fi & 4G / 5G',
    ],
  ),
  _QualityOption(
    code: 'medium',
    title: 'Medium',
    subtitle: '128 kbps AAC • Balanced',
    badge: '128 kbps',
    points: [
      'Format: 128 kbps AAC / Opus',
      'Data Usage: ~2.6 MB – 3.2 MB per 4-min song',
      'Device Fit: Good for everyday listening',
      'Network: Smooth playback on all cellular networks',
    ],
  ),
  _QualityOption(
    code: 'low',
    title: 'Data Saver',
    subtitle: '~70 kbps Opus • Fast Streaming',
    badge: '~70 kbps',
    points: [
      'Format: ~70 kbps Opus stream',
      'Data Usage: ~1.6 MB – 2.0 MB per 4-min song',
      'Device Fit: Low memory and CPU usage',
      'Network: 50%+ data savings on limited data plans',
    ],
  ),
  _QualityOption(
    code: 'ultra_low',
    title: 'Ultra Data Saver',
    subtitle: '~50 kbps Opus • Minimal Data',
    badge: '~50 kbps',
    points: [
      'Format: ~50 kbps Opus stream',
      'Data Usage: ~1.0 MB – 1.3 MB per 4-min song',
      'Device Fit: Maximum battery preservation',
      'Network: Plays reliably in low-coverage areas',
    ],
  ),
];

const _videoQualityOptions = <_QualityOption>[
  _QualityOption(
    code: '8k',
    title: '8K Ultra HD',
    subtitle: '4320p • Extreme Definition',
    badge: '4320p',
    points: [
      'Resolution: 7680×4320 (4320p 8K UHD)',
      'Data Usage: ~280 MB – 420 MB per 4-min video',
      'Device Fit: Flagship devices with 8K hardware decoder',
      'Network: Unmetered ultra-fast Wi-Fi or 5G',
    ],
  ),
  _QualityOption(
    code: '4k',
    title: '4K Cinema',
    subtitle: '2160p • Ultra Crisp',
    badge: '2160p',
    points: [
      'Resolution: 3840×2160 (2160p 4K UHD)',
      'Data Usage: ~120 MB – 180 MB per 4-min video',
      'Device Fit: Premium AMOLED & tablet screens',
      'Network: High-speed Wi-Fi or fast 5G',
    ],
  ),
  _QualityOption(
    code: '2k',
    title: '2K Quad HD',
    subtitle: '1440p • Pristine Clarity',
    badge: '1440p',
    points: [
      'Resolution: 2560×1440 (1440p QHD)',
      'Data Usage: ~60 MB – 90 MB per 4-min video',
      'Device Fit: Crisp on 2K / 120Hz displays',
      'Network: Solid broadband Wi-Fi or 4G/5G',
    ],
  ),
  _QualityOption(
    code: '1080p',
    title: 'Full HD',
    subtitle: '1080p • Studio Sharp',
    badge: '1080p',
    points: [
      'Resolution: 1920×1080 (1080p Full HD)',
      'Data Usage: ~28 MB – 45 MB per 4-min video',
      'Device Fit: Razor-sharp on 1080p phone screens',
      'Network: Standard Wi-Fi and reliable 4G',
    ],
  ),
  _QualityOption(
    code: '720p',
    title: 'HD',
    subtitle: '720p • Balanced Quality',
    badge: '720p',
    isRecommended: true,
    points: [
      'Resolution: 1280×720 (720p HD)',
      'Data Usage: ~12 MB – 18 MB per 4-min video',
      'Device Fit: Recommended for all phones • Cool & smooth',
      'Network: Fast buffer and instant seeking anywhere',
    ],
  ),
  _QualityOption(
    code: '480p',
    title: 'Standard',
    subtitle: '480p • Smooth Playback',
    badge: '480p',
    points: [
      'Resolution: 854×480 (480p SD)',
      'Data Usage: ~6 MB – 9 MB per 4-min video',
      'Device Fit: Lightweight on GPU, RAM and battery',
      'Network: Quick loading on weaker cellular signals',
    ],
  ),
  _QualityOption(
    code: '360p',
    title: 'Data Saver',
    subtitle: '360p • Minimal Bandwidth',
    badge: '360p',
    points: [
      'Resolution: 640×360 (360p Compact)',
      'Data Usage: ~3 MB – 5 MB per 4-min video',
      'Device Fit: Minimal heat and lowest power drain',
      'Network: Works smoothly on 2G / 3G and strict quotas',
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
      'Data Usage: ~180 KB – 320 KB per image',
      'Device Fit: Best for tablets & large flagship displays',
      'Network: Best on Wi-Fi & fast mobile data',
    ],
  ),
  _QualityOption(
    code: 'medium',
    title: 'Medium',
    subtitle: '450px • Standard HD',
    badge: '450px',
    isRecommended: true,
    points: [
      'Resolution: 450×450 standard cover art',
      'Data Usage: ~70 KB – 120 KB per image',
      'Device Fit: Recommended for all phones • Ultra-fast scroll',
      'Network: Balanced cache size and snappy loading',
    ],
  ),
  _QualityOption(
    code: 'low',
    title: 'Data Saver',
    subtitle: '200px • Compact',
    badge: '200px',
    points: [
      'Resolution: 200×200 compact thumbnail',
      'Data Usage: ~15 KB – 25 KB per image',
      'Device Fit: Minimal RAM footprint on entry devices',
      'Network: Maximum data savings on slow connections',
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

String _videoQualityLabel(String code) => switch (code) {
  '8k' => '8K Ultra HD (4320p)',
  '4k' => '4K Cinema (2160p)',
  '2k' => '2K Quad HD (1440p)',
  '1080p' => 'Full HD (1080p)',
  '720p' => 'HD (720p)',
  '480p' => 'Standard (480p)',
  '360p' => 'Data Saver (360p)',
  _ => 'HD (720p)',
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
    bool isAudio = false,
    bool isVideo = false,
  }) {
    HapticFeedback.lightImpact();
    final IconData iconData;
    if (isAudio) {
      iconData = CupertinoIcons.waveform;
    } else if (isVideo) {
      iconData = CupertinoIcons.videocam;
    } else {
      iconData = CupertinoIcons.photo;
    }

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
                          child: Icon(iconData, size: 17, color: AM.rose),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Flexible(
                                    child: Text(
                                      opt.title,
                                      style: const TextStyle(
                                        fontFamily: 'SF Pro',
                                        fontSize: 17,
                                        fontWeight: FontWeight.w700,
                                        color: Colors.white,
                                      ),
                                    ),
                                  ),
                                  if (opt.isRecommended) ...[
                                    const SizedBox(width: 6),
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 5,
                                        vertical: 1.5,
                                      ),
                                      decoration: BoxDecoration(
                                        color: AM.rose.withValues(alpha: 0.16),
                                        borderRadius: BorderRadius.circular(5),
                                        border: Border.all(
                                          color: AM.rose.withValues(
                                            alpha: 0.40,
                                          ),
                                          width: 0.8,
                                        ),
                                      ),
                                      child: Text(
                                        'RECOMMENDED',
                                        style: TextStyle(
                                          fontFamily: 'SF Pro',
                                          fontSize: 8,
                                          fontWeight: FontWeight.w700,
                                          letterSpacing: 0.3,
                                          color: AM.rose,
                                        ),
                                      ),
                                    ),
                                  ],
                                ],
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

  Widget _buildQualityOptionRow({
    required BuildContext context,
    required _QualityOption option,
    required bool isSelected,
    bool isAudio = false,
    bool isVideo = false,
    required VoidCallback onTap,
  }) {
    return PressableScale(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Row(
          children: [
            SizedBox(
              width: 24,
              child: isSelected
                  ? const Icon(
                      CupertinoIcons.checkmark_alt,
                      size: 20,
                      color: AM.rose,
                    )
                  : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          option.title,
                          style: TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 16,
                            fontWeight: isSelected
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: isSelected ? AM.rose : Colors.white,
                          ),
                        ),
                      ),
                      if (option.isRecommended) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 5,
                            vertical: 1.5,
                          ),
                          decoration: BoxDecoration(
                            color: AM.rose.withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(5),
                            border: Border.all(
                              color: AM.rose.withValues(alpha: 0.35),
                              width: 0.6,
                            ),
                          ),
                          child: const Text(
                            'RECOMMENDED',
                            style: TextStyle(
                              fontFamily: 'SF Pro',
                              fontSize: 8.5,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.2,
                              color: AM.rose,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    option.subtitle,
                    style: const TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 12.5,
                      fontWeight: FontWeight.w400,
                      color: Color(0xFFA1A1A6),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => _showQualityInfoPopup(
                context,
                option,
                isAudio: isAudio,
                isVideo: isVideo,
              ),
              child: Container(
                width: 32,
                height: 32,
                alignment: Alignment.center,
                child: const Icon(
                  CupertinoIcons.info_circle,
                  size: 20,
                  color: Color(0xFFA1A1A6),
                ),
              ),
            ),
          ],
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
    bool isAudio = false,
    bool isVideo = false,
    required ValueChanged<String> onSelected,
  }) {
    HapticFeedback.lightImpact();
    return DockVisibility.runModal(
      () => showModalBottomSheet<void>(
        context: context,
        useRootNavigator: true,
        backgroundColor: Colors.transparent,
        barrierColor: Colors.black.withValues(alpha: 0.50),
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
                    color: Colors.white.withValues(alpha: 0.12),
                    width: 0.6,
                  ),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.5),
                    blurRadius: 36,
                    offset: const Offset(0, -6),
                  ),
                ],
              ),
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Grabber handle
                    Center(
                      child: Container(
                        width: 36,
                        height: 4.5,
                        margin: const EdgeInsets.only(top: 10, bottom: 10),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.22),
                          borderRadius: BorderRadius.circular(2.5),
                        ),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontFamily: 'SF Pro Display',
                              fontSize: 16.5,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                              letterSpacing: -0.3,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            subtitle,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontFamily: 'SF Pro',
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: Color(0xFFA1A1A6),
                              letterSpacing: -0.1,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Divider(
                      height: 0.5,
                      thickness: 0.5,
                      color: Color(0xFF38383A),
                    ),
                    Flexible(
                      child: SingleChildScrollView(
                        physics: const BouncingScrollPhysics(),
                        padding: EdgeInsets.only(
                          bottom: math.max(16, safeBottom + 8),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            for (int i = 0; i < options.length; i++) ...[
                              _buildQualityOptionRow(
                                context: ctx,
                                option: options[i],
                                isSelected: options[i].code == currentCode,
                                isAudio: isAudio,
                                isVideo: isVideo,
                                onTap: () {
                                  AM.impact();
                                  onSelected(options[i].code);
                                  Navigator.pop(ctx);
                                },
                              ),
                              if (i < options.length - 1)
                                const Divider(
                                  height: 0.5,
                                  thickness: 0.5,
                                  indent: 56,
                                  color: Color(0xFF38383A),
                                ),
                            ],
                          ],
                        ),
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
      subtitle: 'Streaming fidelity for music playback',
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

  Future<void> _pickVideoQuality(SettingsState s) async {
    await _showQualityPickerSheet(
      context: context,
      title: 'Video Streaming Quality',
      subtitle: 'Playback resolution and data usage for music videos',
      options: _videoQualityOptions,
      currentCode: s.videoQuality,
      isAudio: false,
      isVideo: true,
      onSelected: (code) {
        s.setVideoQuality(code);
        appleToast(
          context,
          'Video streaming quality set to ${_videoQualityLabel(code)}',
          icon: CupertinoIcons.videocam,
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

  Future<void> _pickDownloadVideoQuality(SettingsState s) async {
    await _showQualityPickerSheet(
      context: context,
      title: 'Download Video Quality',
      subtitle: 'Video fidelity and storage size for offline videos',
      options: _videoQualityOptions,
      currentCode: s.downloadVideoQuality,
      isAudio: false,
      isVideo: true,
      onSelected: (code) {
        s.setDownloadVideoQuality(code);
        appleToast(
          context,
          'Download video quality set to ${_videoQualityLabel(code)}',
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
              onTap: () => Navigator.of(context, rootNavigator: true).push(
                auth.isLoggedIn
                    ? CupertinoPageRoute<void>(
                        builder: (_) => const ProfileScreen(fromSettings: true),
                      )
                    : CupertinoPageRoute<void>(
                        fullscreenDialog: true,
                        builder: (_) => WelcomeScreen(
                          onFinished: () =>
                              Navigator.of(context, rootNavigator: true).pop(),
                        ),
                      ),
              ),
            ),
          ],
        ),

        // 2. Audio & Video
        AMSection(
          header: 'Audio & Video',
          footer:
              'Streaming resolution dynamically adapts to user limits and network bandwidth.',
          children: [
            AMRow(
              title: 'Audio Quality',
              value: _audioQualityLabel(s.audioQuality),
              chevron: true,
              onTap: () => _pickAudioQuality(s),
            ),
            AMRow(
              title: 'Video Streaming Quality',
              value: _videoQualityLabel(s.videoQuality),
              chevron: true,
              onTap: () => _pickVideoQuality(s),
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
            const CrossfadeStyleSection(),
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
              onTap: () => Navigator.of(context, rootNavigator: true)
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
              'Choose audio, video and artwork fidelity for offline media. High quality downloads provide crystal clear playback with lightweight storage.',
          children: [
            AMRow(
              title: 'Download Audio Quality',
              subtitle: _audioQualityLabel(s.downloadAudioQuality),
              chevron: true,
              onTap: () => _pickDownloadAudioQuality(s),
            ),
            AMRow(
              title: 'Download Video Quality',
              subtitle: _videoQualityLabel(s.downloadVideoQuality),
              chevron: true,
              onTap: () => _pickDownloadVideoQuality(s),
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
          header: 'System Notifications',
          footer:
              'Zenify only sends high-value system alerts with zero routine spam. Quiet hours are respected from 10 PM to 9 AM.',
          children: [
            AMSwitchRow(
              title: 'App Updates',
              subtitle: 'New version releases and changelogs',
              value: s.notifyUpdates,
              onChanged: s.setNotifyUpdates,
            ),
            AMSwitchRow(
              title: 'Discovery & Replay',
              subtitle: 'Atlas world explorer and taste reminders',
              value: s.notifyDiscovery,
              onChanged: s.setNotifyDiscovery,
            ),
            AMSwitchRow(
              title: 'Weekly Sunday Digest',
              subtitle: 'Weekly listening hours and top artist summary at 8 PM',
              value: s.notifyWeeklyDigest,
              onChanged: s.setNotifyWeeklyDigest,
            ),
            AMSwitchRow(
              title: 'New Releases',
              subtitle: 'From your favorite and followed artists',
              value: s.newReleaseAlerts,
              onChanged: s.setNewReleaseAlerts,
            ),
            AMSwitchRow(
              title: 'Room Together Invites',
              subtitle: 'Live shared listening party invitations',
              value: s.notifyTogetherInvites,
              onChanged: s.setNotifyTogetherInvites,
            ),
            AMSwitchRow(
              title: 'Offline Downloads',
              subtitle: 'Alerts when background music downloads complete',
              value: s.notifyDownloads,
              onChanged: s.setNotifyDownloads,
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
