import 'dart:convert';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart';
import '../../design_system/apple/apple_tokens.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../services/auth_state.dart';
import '../../services/cache_service.dart';
import '../../services/country_service.dart';
import '../../services/dock_visibility.dart';
import '../../services/settings_service.dart';
import '../../services/update_service.dart';
import '../../services/user_preferences_service.dart';
import '../auth/onboarding_sheet.dart';
import '../auth/welcome_screen.dart';
import '../player/studio_fx_sheet.dart';
import '../profile/profile_edit_sheets.dart';
import '../profile/profile_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> with HideDocksMixin {
  @override
  bool get hideMiniPlayerWhileActive => true;

  int _versionTapCount = 0;
  String _appVersion = 'v1.0.9 (Build 13)';

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

  String _qualityLabel(String code) => switch (code) {
        'low' => '128k',
        'high' => '256k',
        'lossless' => '320k HQ',
        _ => code,
      };

  String _scriptLabel(String code) => switch (code) {
        'tanglish' => 'Tanglish',
        'hinglish' => 'Hinglish',
        _ => 'Original',
      };

  Future<void> _pickOption({
    required String title,
    required String current,
    required Map<String, String> options,
    required ValueChanged<String> onSelected,
  }) async {
    String? picked;
    await ZenDropdown.show<void>(
      context: context,
      title: title,
      items: [
        for (final entry in options.entries)
          ZenDropdownItem(
            title: entry.value,
            icon: CupertinoIcons.slider_horizontal_3,
            isSelected: entry.key == current,
            onTap: () => picked = entry.key,
          ),
      ],
    );
    if (picked != null) {
      HapticFeedback.selectionClick();
      onSelected(picked!);
    }
  }

  Future<void> _onCheckForUpdates() async {
    HapticFeedback.lightImpact();
    appleToast(context, 'Checking release channel...', icon: CupertinoIcons.cloud_download);
    final info = await UpdateService.instance.checkForUpdate(silent: false);
    if (!mounted) return;

    if (info != null && info.hasUpdate) {
      UpdateService.instance.showUpdateSheet(context, info);
      return;
    }

    AppleSheet.show<void>(
      context,
      initial: 0.48,
      builder: (ctx, sc) => ListView(
        controller: sc,
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          SheetHeader(
            title: 'Up to Date',
            subtitle: 'Zenify Release Channel',
            trailing: CircleIconButton(
              icon: CupertinoIcons.xmark,
              size: 30,
              onTap: () => Navigator.of(ctx).pop(),
            ),
          ),
          const SizedBox(height: 8),
          GroupedSection(
            children: [
              AppleRow(title: 'Current Build', trailing: Text(_appVersion, style: AT.subhead)),
              const AppleRow(title: 'Channel', trailing: Text('Production', style: AT.subhead)),
              AppleRow(
                title: 'Status',
                trailing: Text('Latest installed', style: AT.subhead.copyWith(color: AT.green)),
              ),
              const AppleRow(
                title: 'Audio Pipeline',
                trailing: Text('InnerTube + StudioFX', style: AT.subhead),
              ),
            ],
          ),
        ],
      ),
    );
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
    AppleSheet.show<void>(
      context,
      initial: 0.52,
      builder: (ctx, sc) => ListView(
        controller: sc,
        padding: const EdgeInsets.only(bottom: 24),
        children: [
          SheetHeader(
            title: 'Diagnostics',
            subtitle: 'Audio & Cache Engine',
            trailing: CircleIconButton(
              icon: CupertinoIcons.xmark,
              size: 30,
              onTap: () => Navigator.of(ctx).pop(),
            ),
          ),
          const SizedBox(height: 8),
          GroupedSection(
            children: [
              const AppleRow(title: 'Engine', trailing: Text('Media3 / ExoPlayer', style: AT.subhead)),
              const AppleRow(title: 'Pipeline', trailing: Text('StudioFX 8D & EQ', style: AT.subhead)),
              AppleRow(
                title: 'Cache Cap',
                trailing: Text(
                  '${SettingsState.instance.maxCacheGb.toStringAsFixed(1)} GB',
                  style: AT.subhead,
                ),
              ),
              const AppleRow(title: 'Sync', trailing: Text('Timestamp Conflict', style: AT.subhead)),
            ],
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final settings = context.watch<SettingsState>();
    final user = auth.user;

    return Scaffold(
      backgroundColor: AT.bg,
      body: SafeArea(
        bottom: false,
        child: ListenableBuilder(
          listenable: Listenable.merge([
            UserPreferencesService.instance.prefsNotifier,
            CountryService.instance.countryNotifier,
          ]),
          builder: (context, _) {
            final prefs = UserPreferencesService.instance.current;
            final country = CountryService.instance.currentCountry;
            final displayName = UserPreferencesService.resolveDisplayName(
              accountName: user?.name,
              displayName: user?.displayName,
              username: user?.username,
            );

            return CustomScrollView(
              physics: const BouncingScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: Row(
                      children: [
                        CircleIconButton(
                          icon: CupertinoIcons.chevron_left,
                          onTap: () => Navigator.of(context).pop(),
                        ),
                      ],
                    ),
                  ),
                ),
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(20, 14, 20, 18),
                    child: Text('Settings', style: AT.largeTitle),
                  ),
                ),

                // 1. Account Card Row
                SliverToBoxAdapter(
                  child: GroupedSection(
                    children: [
                      AppleRow(
                        leading: Avatar(name: displayName, size: 46),
                        title: displayName,
                        subtitle: auth.isLoggedIn
                            ? (user?.email ?? 'Signed in')
                            : 'Sign in to sync library & replay stats',
                        trailing: auth.isLoggedIn
                            ? const _Chevron()
                            : PillButton(
                                label: 'Sign In',
                                compact: true,
                                style: PillStyle.filled,
                                onTap: () => Navigator.of(context).push(
                                  CupertinoPageRoute<void>(
                                    fullscreenDialog: true,
                                    builder: (_) => WelcomeScreen(
                                      onFinished: () => Navigator.of(context).pop(),
                                    ),
                                  ),
                                ),
                              ),
                        onTap: () => Navigator.of(context).push(
                          CupertinoPageRoute<void>(
                            builder: (_) => const ProfileScreen(),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

                // 2. Identity & Music Tastes
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'PROFILE & MUSIC TASTES',
                    children: [
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.person_fill, color: AT.accent),
                        title: 'Name, Age & Gender',
                        subtitle: [
                          displayName,
                          if (prefs?.age != null) '${prefs!.age}',
                          if (prefs?.gender != null) prefs!.gender!,
                        ].join(' · '),
                        trailing: const _Chevron(),
                        onTap: () => showIdentityEditSheet(context),
                      ),
                      AppleRow(
                        leading: Text(country.flag, style: const TextStyle(fontSize: 22)),
                        title: 'Music Region',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(country.name, style: AT.subhead),
                            const SizedBox(width: 6),
                            const _Chevron(),
                          ],
                        ),
                        onTap: () => showRegionPickerSheet(context),
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.chat_bubble_2_fill, color: AT.blue),
                        title: 'Languages',
                        subtitle: prefs != null && prefs.languages.isNotEmpty
                            ? prefs.languages.join(', ')
                            : 'Select languages',
                        trailing: const _Chevron(),
                        onTap: () => showLanguagesPickerSheet(context),
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.music_note_2, color: AT.amber),
                        title: 'Genres & Vibes',
                        subtitle: prefs != null && prefs.genres.isNotEmpty
                            ? prefs.genres.join(', ')
                            : 'Select genres',
                        trailing: const _Chevron(),
                        onTap: () => showGenresPickerSheet(context),
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.music_mic, color: Color(0xFFBF5AF2)),
                        title: 'Favorite Artists',
                        subtitle: prefs != null && prefs.favoriteArtists.isNotEmpty
                            ? prefs.favoriteArtists.map((a) => a.name).join(', ')
                            : 'Select artists',
                        trailing: const _Chevron(),
                        onTap: () => showArtistsPickerSheet(context),
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.sparkles, color: AT.green),
                        title: 'Guided Setup Wizard',
                        trailing: const _Chevron(),
                        onTap: () => OnboardingSheet.show(context, isEditing: true),
                      ),
                    ],
                  ),
                ),

                // 3. Audio & Fidelity
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'AUDIO & FIDELITY',
                    children: [
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.wifi, color: AT.blue),
                        title: 'Wi-Fi Streaming',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_qualityLabel(settings.wifiQuality), style: AT.subhead),
                            const SizedBox(width: 6),
                            const _Chevron(),
                          ],
                        ),
                        onTap: () => _pickOption(
                          title: 'Wi-Fi Streaming Quality',
                          current: settings.wifiQuality,
                          options: const {'low': '128k', 'high': '256k', 'lossless': '320k HQ'},
                          onSelected: settings.setWifiQuality,
                        ),
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.antenna_radiowaves_left_right, color: AT.green),
                        title: 'Cellular Streaming',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_qualityLabel(settings.cellularQuality), style: AT.subhead),
                            const SizedBox(width: 6),
                            const _Chevron(),
                          ],
                        ),
                        onTap: () => _pickOption(
                          title: 'Cellular Streaming Quality',
                          current: settings.cellularQuality,
                          options: const {'low': '128k', 'high': '256k', 'lossless': '320k HQ'},
                          onSelected: settings.setCellularQuality,
                        ),
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.arrow_down_circle_fill, color: AT.accent),
                        title: 'Download Quality',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_qualityLabel(settings.downloadQuality), style: AT.subhead),
                            const SizedBox(width: 6),
                            const _Chevron(),
                          ],
                        ),
                        onTap: () => _pickOption(
                          title: 'Download Quality',
                          current: settings.downloadQuality,
                          options: const {'low': '128k', 'high': '256k', 'lossless': '320k HQ'},
                          onSelected: settings.setDownloadQuality,
                        ),
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.waveform, color: Color(0xFFBF5AF2)),
                        title: 'Studio FX & Spatial Engine',
                        subtitle: '8D rotation, parametric EQ & reverb',
                        trailing: const _Chevron(),
                        onTap: () => showStudioFxSheet(context),
                      ),
                      AppleSwitchRow(
                        title: 'Volume Normalization',
                        subtitle: 'Keep volume consistent across songs',
                        value: settings.normalizeVolume,
                        onChanged: settings.setNormalizeVolume,
                      ),
                      AppleSwitchRow(
                        title: 'Explicit Content Filter',
                        subtitle: 'Filter explicit tracks and lyrics',
                        value: settings.explicitFilter,
                        onChanged: settings.setExplicitFilter,
                      ),
                      AppleSwitchRow(
                        title: 'Mono Audio',
                        subtitle: 'Combine left and right channels',
                        value: settings.monoAudio,
                        onChanged: settings.setMonoAudio,
                      ),
                      AppleSwitchRow(
                        title: 'Gapless Playback',
                        subtitle: 'Seamless transitions between tracks',
                        value: settings.gaplessPlayback,
                        onChanged: settings.setGaplessPlayback,
                      ),
                    ],
                  ),
                ),

                // 4. Playback & Controls
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'PLAYBACK & LYRICS',
                    children: [
                      _SliderRow(
                        title: 'Crossfade',
                        valueLabel: settings.crossfadeSeconds > 0 ? '${settings.crossfadeSeconds}s' : 'Off',
                        value: settings.crossfadeSeconds.toDouble(),
                        min: 0,
                        max: 12,
                        divisions: 12,
                        onChanged: (v) => settings.setCrossfadeSeconds(v.round()),
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.text_quote, color: AT.accent),
                        title: 'Lyrics Script',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(_scriptLabel(settings.lyricsDefaultScript), style: AT.subhead),
                            const SizedBox(width: 6),
                            const _Chevron(),
                          ],
                        ),
                        onTap: () => _pickOption(
                          title: 'Default Lyrics Script',
                          current: settings.lyricsDefaultScript,
                          options: const {
                            'original': 'Original',
                            'tanglish': 'Tanglish',
                            'hinglish': 'Hinglish',
                          },
                          onSelected: settings.setLyricsDefaultScript,
                        ),
                      ),
                      AppleSwitchRow(
                        title: 'Autoplay Similar Music',
                        subtitle: 'Keep playing similar songs when queue ends',
                        value: settings.autoplaySimilar,
                        onChanged: settings.setAutoplaySimilar,
                      ),
                      AppleSwitchRow(
                        title: 'Pause on Disconnect',
                        subtitle: 'Pause when headphones unplug',
                        value: settings.pauseOnDisconnect,
                        onChanged: settings.setPauseOnDisconnect,
                      ),
                      AppleSwitchRow(
                        title: 'Resume Where Left Off',
                        subtitle: 'Restore queue on startup',
                        value: settings.resumeWhereLeftOff,
                        onChanged: settings.setResumeWhereLeftOff,
                      ),
                    ],
                  ),
                ),

                // 5. Aesthetics & Motion
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'APPEARANCE & HAPTICS',
                    children: [
                      AppleSwitchRow(
                        title: 'Album Color Glow',
                        subtitle: 'Subtle ambient glow from artwork',
                        value: settings.dynamicAlbumColors,
                        onChanged: settings.setDynamicAlbumColors,
                      ),
                      AppleSwitchRow(
                        title: 'Fluid Mesh Canvas',
                        subtitle: 'Reactive player artwork backdrop',
                        value: settings.fluidMeshBg,
                        onChanged: settings.setFluidMeshBg,
                      ),
                      AppleSwitchRow(
                        title: 'Glass Effects',
                        subtitle: 'Translucent blur on supported devices',
                        value: settings.glassEffects,
                        onChanged: settings.setGlassEffects,
                      ),
                      AppleSwitchRow(
                        title: 'Hide Details When Idle',
                        subtitle: 'Fade player controls during fullscreen',
                        value: settings.autoHideDetails,
                        onChanged: settings.setAutoHideDetails,
                      ),
                      AppleSwitchRow(
                        title: 'Haptic Feedback',
                        subtitle: 'Tactile response on buttons & sliders',
                        value: settings.hapticsEnabled,
                        onChanged: settings.setHapticsEnabled,
                      ),
                      AppleSwitchRow(
                        title: 'Reduce Motion',
                        subtitle: 'Calm alpha fades instead of springs',
                        value: settings.reduceMotion,
                        onChanged: settings.setReduceMotion,
                      ),
                    ],
                  ),
                ),

                // 6. Notifications
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'NOTIFICATIONS',
                    children: [
                      AppleSwitchRow(
                        title: 'New Releases',
                        subtitle: 'Alerts from favorite artists',
                        value: settings.newReleaseAlerts,
                        onChanged: settings.setNewReleaseAlerts,
                      ),
                      AppleSwitchRow(
                        title: 'Room Together Invites',
                        subtitle: 'Alerts when invited to listen',
                        value: settings.notifyTogetherInvites,
                        onChanged: settings.setNotifyTogetherInvites,
                      ),
                      AppleSwitchRow(
                        title: 'Weekly Replay Summary',
                        subtitle: 'Weekly listening highlights by email',
                        value: settings.weeklySummaryEmail,
                        onChanged: settings.setWeeklySummaryEmail,
                      ),
                    ],
                  ),
                ),

                // 7. Privacy & Personalization
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'PRIVACY',
                    children: [
                      AppleSwitchRow(
                        title: 'Personalized Experience',
                        subtitle: 'Tailors Home and Quick Picks to you',
                        value: settings.personalizationEnabled,
                        onChanged: settings.setPersonalizationEnabled,
                      ),
                      AppleSwitchRow(
                        title: 'Save Listening History',
                        subtitle: 'Builds your personal Replay stats',
                        value: settings.saveListeningHistory,
                        onChanged: settings.setSaveListeningHistory,
                      ),
                      AppleSwitchRow(
                        title: 'Private Session',
                        subtitle: 'Listen without logging plays',
                        value: settings.privateSession,
                        onChanged: settings.setPrivateSession,
                      ),
                      AppleSwitchRow(
                        title: 'Show Top Artists on Profile',
                        value: settings.showTopArtists,
                        onChanged: settings.setShowTopArtists,
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.trash, color: AT.red),
                        title: 'Clear Listening History',
                        destructive: true,
                        onTap: () => _confirmClearHistory(settings),
                      ),
                    ],
                  ),
                ),

                // 8. Storage & Cache
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'STORAGE & DOWNLOADS',
                    children: [
                      AppleSwitchRow(
                        title: 'Download on Wi-Fi Only',
                        value: settings.downloadWifiOnly,
                        onChanged: settings.setDownloadWifiOnly,
                      ),
                      _SliderRow(
                        title: 'Maximum Disk Cache',
                        valueLabel: '${settings.maxCacheGb.toStringAsFixed(1)} GB',
                        value: settings.maxCacheGb,
                        min: 0.5,
                        max: 10.0,
                        divisions: 19,
                        onChanged: settings.setMaxCacheGb,
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.trash, color: AT.amber),
                        title: 'Clear Media & Artwork Cache',
                        subtitle: 'Purge cached streams and covers',
                        trailing: const _Chevron(),
                        onTap: () async {
                          await CacheService.clearAllMediaAndArtworkCache();
                          if (!context.mounted) return;
                          appleToast(context, 'Media & artwork cache cleared');
                        },
                      ),
                    ],
                  ),
                ),

                // 9. Account & Security
                if (auth.isLoggedIn)
                  SliverToBoxAdapter(
                    child: GroupedSection(
                      title: 'SECURITY & ACCOUNT',
                      children: [
                        AppleRow(
                          leading: const IconTile(CupertinoIcons.device_phone_portrait, color: AT.blue),
                          title: 'Active Sessions',
                          subtitle: 'Manage signed-in devices',
                          trailing: const _Chevron(),
                          onTap: _showSessionsSheet,
                        ),
                        AppleRow(
                          leading: const IconTile(CupertinoIcons.square_arrow_down, color: AT.green),
                          title: 'Export My Data',
                          subtitle: 'Download GDPR archive',
                          trailing: const _Chevron(),
                          onTap: _exportUserData,
                        ),
                        AppleRow(
                          leading: const IconTile(CupertinoIcons.square_arrow_left, color: Color(0xFF8E8E93)),
                          title: 'Sign Out',
                          onTap: () => _confirmSignOut(auth),
                        ),
                        AppleRow(
                          leading: const IconTile(CupertinoIcons.exclamationmark_triangle_fill, color: AT.red),
                          title: 'Delete Account',
                          destructive: true,
                          onTap: () => _confirmDeleteAccount(auth),
                        ),
                      ],
                    ),
                  ),

                // 10. About Zenify
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'ABOUT',
                    children: [
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.info_circle_fill, color: Color(0xFF8E8E93)),
                        title: 'Version',
                        trailing: Text(_appVersion, style: AT.subhead),
                        onTap: _onVersionTapped,
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.arrow_2_circlepath, color: AT.blue),
                        title: 'Check for Updates',
                        trailing: const _Chevron(),
                        onTap: _onCheckForUpdates,
                      ),
                      AppleRow(
                        leading: const IconTile(CupertinoIcons.chevron_left_slash_chevron_right, color: Color(0xFF8E8E93)),
                        title: 'Open Source Licenses',
                        trailing: const _Chevron(),
                        onTap: () => showLicensePage(context: context),
                      ),
                    ],
                  ),
                ),

                SliverToBoxAdapter(
                  child: SizedBox(height: MediaQuery.paddingOf(context).bottom + 32),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  void _confirmClearHistory(SettingsState settings) {
    showCupertinoDialog<void>(
      context: context,
      useRootNavigator: true,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Clear Listening History?'),
        content: const Text(
          'This will permanently reset your listening events, stats, and Replay history across devices.',
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
              if (mounted) {
                appleToast(context, ok ? 'Listening history cleared' : 'Failed to clear history');
              }
            },
            child: const Text('Clear'),
          ),
        ],
      ),
    );
  }

  void _confirmSignOut(AuthState auth) {
    showCupertinoDialog<void>(
      context: context,
      useRootNavigator: true,
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
    showCupertinoDialog<void>(
      context: context,
      useRootNavigator: true,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Delete Account'),
        content: const Text(
          'This action is irreversible. All playlists, favorites, and preferences will be permanently deleted.',
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

  Future<void> _showSessionsSheet() async {
    final token = await AuthService.instance.getAccessToken();
    if (token == null || !mounted) return;

    AppleSheet.show<void>(
      context,
      initial: 0.65,
      builder: (ctx, sc) => FutureBuilder<http.Response>(
        future: http.get(
          Uri.parse('${ApiService.baseUrl}/api/me/sessions'),
          headers: {'Authorization': 'Bearer $token'},
        ),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CupertinoActivityIndicator());
          }
          if (snapshot.data!.statusCode != 200) {
            return const Center(
              child: Text('Could not load active sessions', style: AT.subhead),
            );
          }

          final sessions = (jsonDecode(snapshot.data!.body) as List<dynamic>?) ?? [];
          return ListView(
            controller: sc,
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              SheetHeader(
                title: 'Active Sessions',
                subtitle: '${sessions.length} signed-in device${sessions.length == 1 ? '' : 's'}',
                trailing: CircleIconButton(
                  icon: CupertinoIcons.xmark,
                  size: 30,
                  onTap: () => Navigator.of(ctx).pop(),
                ),
              ),
              const SizedBox(height: 8),
              GroupedSection(
                children: [
                  for (final raw in sessions)
                    Builder(
                      builder: (_) {
                        final s = raw as Map<String, dynamic>;
                        final deviceName = (s['deviceName'] as String?) ?? 'Device';
                        final platform = (s['platform'] as String?) ?? 'Mobile';
                        final isCurrent = s['isCurrent'] == true;
                        return AppleRow(
                          leading: IconTile(
                            platform == 'web'
                                ? CupertinoIcons.desktopcomputer
                                : CupertinoIcons.device_phone_portrait,
                            color: isCurrent ? AT.accent : const Color(0xFF8E8E93),
                          ),
                          title: deviceName,
                          subtitle: isCurrent ? '$platform · This device' : platform,
                          trailing: isCurrent
                              ? null
                              : CupertinoButton(
                                  padding: EdgeInsets.zero,
                                  minimumSize: const Size(28, 28),
                                  onPressed: () async {
                                    final id = s['id'];
                                    await http.delete(
                                      Uri.parse('${ApiService.baseUrl}/api/me/sessions/$id'),
                                      headers: {'Authorization': 'Bearer $token'},
                                    );
                                    if (ctx.mounted) Navigator.of(ctx).pop();
                                  },
                                  child: Text(
                                    'Revoke',
                                    style: AT.footnote.copyWith(
                                      color: AT.red,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                        );
                      },
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _exportUserData() async {
    final token = await AuthService.instance.getAccessToken();
    if (token == null) return;

    try {
      final res = await http.get(
        Uri.parse('${ApiService.baseUrl}/api/me/export'),
        headers: {'Authorization': 'Bearer $token'},
      );

      if (res.statusCode == 200 && mounted) {
        showCupertinoDialog<void>(
          context: context,
          useRootNavigator: true,
          builder: (ctx) => CupertinoAlertDialog(
            title: const Text('Data Export Ready'),
            content: const Text(
              'Your complete GDPR archive has been prepared with your playlists, preferences, and listening stats.',
            ),
            actions: [
              CupertinoDialogAction(
                isDefaultAction: true,
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Done'),
              ),
            ],
          ),
        );
      }
    } catch (_) {}
  }
}

class _Chevron extends StatelessWidget {
  const _Chevron();

  @override
  Widget build(BuildContext context) {
    return const Icon(CupertinoIcons.chevron_forward, size: 15, color: AT.label3);
  }
}

class _SliderRow extends StatelessWidget {
  const _SliderRow({
    required this.title,
    required this.valueLabel,
    required this.value,
    required this.min,
    required this.max,
    required this.divisions,
    required this.onChanged,
  });

  final String title;
  final String valueLabel;
  final double value;
  final double min;
  final double max;
  final int divisions;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title, style: AT.callout),
              Text(valueLabel, style: AT.subhead.copyWith(color: AT.accent, fontWeight: FontWeight.w600)),
            ],
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              activeTrackColor: AT.accent,
              inactiveTrackColor: AT.fillStrong,
              thumbColor: Colors.white,
              overlayColor: AT.accent.withValues(alpha: 0.16),
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
}
