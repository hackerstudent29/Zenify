import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart' show appleToast, Avatar;
import '../../design_system/apple/apple_music_kit.dart';
import '../../services/auth_state.dart';
import '../../services/cache_service.dart';
import '../../services/glass_engine.dart';
import '../../services/settings_service.dart';
import '../../services/update_service.dart';
import '../../services/user_preferences_service.dart';
import '../auth/welcome_screen.dart';
import '../player/studio_fx_sheet.dart';
import '../profile/profile_screen.dart';
import 'glass_customizer_screen.dart';

const _qualities = <(String, String, String)>[
  ('low', 'Standard', '128 kbps. Uses the least data.'),
  ('high', 'High', '256 kbps. Balanced quality.'),
  ('lossless', 'Highest', '320 kbps. Best sound, most data.'),
];

String _qualityLabel(String code) => switch (code) {
      'low' => 'Standard',
      'high' => 'High',
      'lossless' => 'Highest',
      _ => code,
    };

String _scriptLabel(String code) => switch (code) {
      'tanglish' => 'Tanglish',
      'hinglish' => 'Hinglish',
      _ => 'Original',
    };

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  int _versionTaps = 0;
  String _version = 'v1.0.9 (Build 13)';

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform().then((info) {
      if (mounted) setState(() => _version = 'v${info.version} (Build ${info.buildNumber})');
    }).catchError((_) {});
  }

  Future<void> _checkForUpdates() async {
    AM.impact();
    appleToast(context, 'Checking for updates…', icon: CupertinoIcons.cloud_download);
    final info = await UpdateService.instance.checkForUpdate(silent: false);
    if (!mounted) return;
    if (info != null && info.hasUpdate) {
      UpdateService.instance.showUpdateSheet(context, info);
      return;
    }
    showAMInfo(
      context,
      title: 'Up to Date',
      subtitle: 'Zenify release channel',
      rows: {'Current Build': _version, 'Channel': 'Production', 'Status': 'Latest installed'},
    );
  }

  void _onVersionTap() {
    _versionTaps++;
    if (_versionTaps >= 7) {
      _versionTaps = 0;
      HapticFeedback.heavyImpact();
      showAMInfo(
        context,
        title: 'Diagnostics',
        subtitle: 'Audio & cache engine',
        rows: {
          'Engine': 'Media3 / ExoPlayer',
          'Pipeline': 'StudioFX 8D & EQ',
          'Cache Cap': '${SettingsState.instance.maxCacheGb.toStringAsFixed(2)} GB',
          'Glass': GlassEngine.instance.presetName,
        },
      );
    } else {
      AM.tick();
    }
  }

  Future<void> _pickScript(SettingsState s) async {
    final v = await showAMOptions<String>(
      context,
      title: 'Lyrics Script',
      options: const [('original', 'Original'), ('tanglish', 'Tanglish'), ('hinglish', 'Hinglish')],
      current: s.lyricsDefaultScript,
    );
    if (v != null) s.setLyricsDefaultScript(v);
  }

  void _confirmClearHistory(SettingsState s) {
    showCupertinoDialog<void>(
      context: context,
      useRootNavigator: true,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Clear Listening History?'),
        content: const Text(
          'This permanently resets your listening events, stats and Replay history on all devices.',
        ),
        actions: [
          CupertinoDialogAction(onPressed: () => Navigator.of(ctx).pop(), child: const Text('Cancel')),
          CupertinoDialogAction(
            isDestructiveAction: true,
            onPressed: () async {
              Navigator.of(ctx).pop();
              final ok = await s.clearListeningHistory();
              if (mounted) appleToast(context, ok ? 'Listening history cleared' : 'Could not clear history');
            },
            child: const Text('Clear'),
          ),
        ],
      ),
    );
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
        // Account
        AMSection(
          children: [
            AMRow(
              leading: Avatar(name: name, size: 46),
              title: name,
              subtitle: auth.isLoggedIn ? (user?.email ?? 'Signed in') : 'Sign in to sync your library',
              chevron: auth.isLoggedIn,
              trailing: auth.isLoggedIn
                  ? null
                  : const Text('Sign In', style: TextStyle(color: AM.rose, fontSize: 16, fontWeight: FontWeight.w600)),
              onTap: () => Navigator.of(context).push(
                auth.isLoggedIn
                    ? CupertinoPageRoute<void>(builder: (_) => const ProfileScreen(fromSettings: true))
                    : CupertinoPageRoute<void>(
                        fullscreenDialog: true,
                        builder: (_) => WelcomeScreen(onFinished: () => Navigator.of(context).pop()),
                      ),
              ),
            ),
          ],
        ),

        // Audio
        AMSection(
          header: 'Audio',
          footer: 'Volume normalization keeps loudness consistent between songs.',
          children: [
            AMRow(
              title: 'Audio Quality',
              value: _qualityLabel(s.wifiQuality),
              chevron: true,
              onTap: () => Navigator.of(context).push(
                CupertinoPageRoute<void>(builder: (_) => const _AudioQualityPage()),
              ),
            ),
            AMRow(
              title: 'Studio FX & Spatial',
              subtitle: '8D rotation, parametric EQ and reverb',
              chevron: true,
              onTap: () => showStudioFxSheet(context),
            ),
            AMSwitchRow(
              title: 'Volume Normalization',
              value: s.normalizeVolume,
              onChanged: s.setNormalizeVolume,
            ),
            AMSwitchRow(
              title: 'Mono Audio',
              subtitle: 'Combine left and right channels',
              value: s.monoAudio,
              onChanged: s.setMonoAudio,
            ),
          ],
        ),

        // Playback
        AMSection(
          header: 'Playback',
          children: [
            AMSliderRow(
              title: 'Crossfade',
              valueLabel: s.crossfadeSeconds > 0 ? '${s.crossfadeSeconds}s' : 'Off',
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
              title: 'Pause on Disconnect',
              subtitle: 'Pause when headphones unplug',
              value: s.pauseOnDisconnect,
              onChanged: s.setPauseOnDisconnect,
            ),
            AMSwitchRow(
              title: 'Resume Where I Left Off',
              subtitle: 'Restore the queue on launch',
              value: s.resumeWhereLeftOff,
              onChanged: s.setResumeWhereLeftOff,
            ),
            AMSwitchRow(
              title: 'Explicit Content Filter',
              value: s.explicitFilter,
              onChanged: s.setExplicitFilter,
            ),
            AMRow(
              title: 'Lyrics Script',
              value: _scriptLabel(s.lyricsDefaultScript),
              chevron: true,
              onTap: () => _pickScript(s),
            ),
          ],
        ),

        // Appearance
        AMSection(
          header: 'Appearance',
          children: [
            AMRow(
              title: 'Glass Style',
              subtitle: 'Material, blur, prism and motion',
              value: GlassEngine.instance.presetName,
              chevron: true,
              onTap: () => Navigator.of(context)
                  .push(CupertinoPageRoute<void>(builder: (_) => const GlassCustomizerScreen()))
                  .then((_) {
                if (mounted) setState(() {});
              }),
            ),
            AMSwitchRow(
              title: 'Album Color Glow',
              subtitle: 'Ambient glow from the artwork',
              value: s.dynamicAlbumColors,
              onChanged: s.setDynamicAlbumColors,
            ),
            AMSwitchRow(
              title: 'Fluid Mesh Canvas',
              subtitle: 'Reactive player backdrop',
              value: s.fluidMeshBg,
              onChanged: s.setFluidMeshBg,
            ),
            AMSwitchRow(
              title: 'Hide Details When Idle',
              subtitle: 'Fade player controls in full screen',
              value: s.autoHideDetails,
              onChanged: s.setAutoHideDetails,
            ),
          ],
        ),

        // Accessibility
        AMSection(
          header: 'Accessibility',
          footer: 'Reduce Motion replaces springs and glass animation with calm fades.',
          children: [
            AMSwitchRow(
              title: 'Haptic Feedback',
              subtitle: 'Taps on buttons, switches and sliders',
              value: s.hapticsEnabled,
              onChanged: s.setHapticsEnabled,
            ),
            AMSwitchRow(title: 'Reduce Motion', value: s.reduceMotion, onChanged: s.setReduceMotion),
          ],
        ),

        // Downloads & storage
        AMSection(
          header: 'Downloads & Storage',
          footer: 'The streaming cache keeps recently played songs for faster playback.',
          children: [
            AMSwitchRow(
              title: 'Download on Wi-Fi Only',
              value: s.downloadWifiOnly,
              onChanged: s.setDownloadWifiOnly,
            ),
            AMSliderRow(
              title: 'Streaming Cache',
              valueLabel: '${(s.maxCacheGb * 1000).round()} MB',
              value: s.maxCacheGb.clamp(0.05, 1.0).toDouble(),
              min: 0.05,
              max: 1.0,
              divisions: 19,
              onChanged: s.setMaxCacheGb,
            ),
            AMRow(
              title: 'Clear Cache',
              subtitle: 'Songs, lyrics and artwork. Your account is kept.',
              titleColor: AM.rose,
              onTap: () async {
                await CacheService.clearAllMediaAndArtworkCache();
                if (!mounted) return;
                appleToast(this.context, 'Cache cleared');
              },
            ),
          ],
        ),

        // Notifications
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
            AMSwitchRow(
              title: 'Weekly Replay Summary',
              subtitle: 'Listening highlights by email',
              value: s.weeklySummaryEmail,
              onChanged: s.setWeeklySummaryEmail,
            ),
          ],
        ),

        // Privacy
        AMSection(
          header: 'Privacy',
          children: [
            AMSwitchRow(
              title: 'Personalized Experience',
              subtitle: 'Tailors Home and Quick Picks to you',
              value: s.personalizationEnabled,
              onChanged: s.setPersonalizationEnabled,
            ),
            AMSwitchRow(
              title: 'Save Listening History',
              subtitle: 'Builds your Replay stats',
              value: s.saveListeningHistory,
              onChanged: s.setSaveListeningHistory,
            ),
            AMSwitchRow(
              title: 'Private Session',
              subtitle: 'Listen without logging plays',
              value: s.privateSession,
              onChanged: s.setPrivateSession,
            ),
            AMSwitchRow(
              title: 'Show Top Artists on Profile',
              value: s.showTopArtists,
              onChanged: s.setShowTopArtists,
            ),
            AMRow(
              title: 'Clear Listening History',
              titleColor: AM.rose,
              onTap: () => _confirmClearHistory(s),
            ),
          ],
        ),

        // About
        AMSection(
          header: 'About',
          children: [
            AMRow(title: 'Version', value: _version, onTap: _onVersionTap),
            AMRow(title: 'Check for Updates', chevron: true, onTap: _checkForUpdates),
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

/// One place for Wi-Fi, cellular and download quality.
class _AudioQualityPage extends StatelessWidget {
  const _AudioQualityPage();

  AMSection _group({
    required String header,
    String? footer,
    required String current,
    required ValueChanged<String> onSet,
  }) {
    return AMSection(
      header: header,
      footer: footer,
      children: [
        for (final q in _qualities)
          AMRow(
            title: q.$2,
            subtitle: q.$3,
            trailing: AnimatedOpacity(
              opacity: current == q.$1 ? 1 : 0,
              duration: AM.dur(180),
              child: const Icon(CupertinoIcons.checkmark_alt, size: 20, color: AM.rose),
            ),
            onTap: () => onSet(q.$1),
          ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SettingsState>();
    return AMPage(
      title: 'Audio Quality',
      children: [
        _group(
          header: 'Wi-Fi Streaming',
          current: s.wifiQuality,
          onSet: s.setWifiQuality,
        ),
        _group(
          header: 'Cellular Streaming',
          footer: 'Lower quality saves mobile data.',
          current: s.cellularQuality,
          onSet: s.setCellularQuality,
        ),
        _group(
          header: 'Downloads',
          footer: 'Applies to songs you download from now on.',
          current: s.downloadQuality,
          onSet: s.setDownloadQuality,
        ),
      ],
    );
  }
}
