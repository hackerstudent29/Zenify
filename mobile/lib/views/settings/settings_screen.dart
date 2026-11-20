import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart' show appleToast, Avatar;
import '../../design_system/apple/apple_music_kit.dart';
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

  Future<void> _pickAudioQuality(SettingsState s) async {
    await ZenDropdown.show(
      context: context,
      title: 'Audio Quality',
      subtitle: 'Streaming & download fidelity',
      items: [
        for (final q in _qualities)
          ZenDropdownItem(
            title: q.$2,
            subtitle: q.$3,
            icon: s.wifiQuality == q.$1
                ? CupertinoIcons.checkmark_alt
                : CupertinoIcons.waveform,
            isSelected: s.wifiQuality == q.$1,
            onTap: () {
              s.setWifiQuality(q.$1);
              s.setCellularQuality(q.$1);
              s.setDownloadQuality(q.$1);
            },
          ),
      ],
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
              value: _qualityLabel(s.wifiQuality),
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
          header: 'Appearance',
          children: [
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
              'The streaming cache keeps recently played songs for instant playback.',
          children: [
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
