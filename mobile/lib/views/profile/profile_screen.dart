import 'dart:async';
import 'dart:convert';

import 'package:flutter/cupertino.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart' show Avatar, appleToast;
import '../../design_system/apple/apple_music_kit.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../../services/api_service.dart';
import '../../services/auth_service.dart';
import '../../services/auth_state.dart';
import '../../services/country_service.dart';
import '../../services/dock_visibility.dart';
import '../../services/settings_service.dart';
import '../../services/user_preferences_service.dart';
import '../auth/onboarding_sheet.dart';
import '../auth/welcome_screen.dart';
import '../../features/replay/presentation/replay_screen.dart';
import '../room_together/room_together_screen.dart';
import '../settings/settings_screen.dart';
import 'profile_edit_sheets.dart';

class ProfileScreen extends StatefulWidget {
  /// When opened from Settings, the navigation bar avoids redundant gear icon.
  const ProfileScreen({super.key, this.fromSettings = false});
  final bool fromSettings;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> with HideDocksMixin {
  @override
  bool get hideMiniPlayerWhileActive => true;

  static const _edit = Text(
    'Edit',
    style: TextStyle(
      fontFamily: 'SF Pro',
      color: AM.rose,
      fontSize: 17,
      fontWeight: FontWeight.w500,
    ),
  );

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
    final user = auth.user;

    return ListenableBuilder(
      listenable: Listenable.merge([
        UserPreferencesService.instance.prefsNotifier,
        CountryService.instance.countryNotifier,
      ]),
      builder: (context, _) {
        final prefs = UserPreferencesService.instance.current;
        final country = CountryService.instance.currentCountry;
        final name = UserPreferencesService.resolveDisplayName(
          accountName: user?.name,
          displayName: user?.displayName,
          username: user?.username,
        );
        final handle = [
          if (user != null &&
              user.username.trim().isNotEmpty &&
              user.username != 'guest')
            '@${user.username.trim()}',
          if (user != null && user.email.trim().isNotEmpty) user.email.trim(),
        ].join(' · ');

        String summary(Iterable<String>? items, String empty) =>
            items == null || items.isEmpty ? empty : items.join(', ');

        return AMPage(
          title: 'Profile',
          trailing: widget.fromSettings
              ? null
              : DynamicIslandActionButton(
                  icon: CupertinoIcons.gear,
                  onTap: () => Navigator.of(context, rootNavigator: true).push(
                    CupertinoPageRoute<void>(
                      builder: (_) => const SettingsScreen(),
                    ),
                  ),
                ),
          children: [
            // 1. Identity
            AMSection(
              children: [
                AMRow(
                  leading: Avatar(name: name, size: 46),
                  title: name,
                  subtitle: handle.isNotEmpty
                      ? handle
                      : (auth.isLoggedIn ? 'Zenify Member' : 'Guest Listener'),
                  trailing: _edit,
                  onTap: () => showIdentityEditSheet(context),
                ),
              ],
            ),
            if (!auth.isLoggedIn)
              AMSection(
                children: [
                  AMRow(
                    title: 'Sign In',
                    subtitle:
                        'Sync your library and see your Replay stats on every device.',
                    chevron: true,
                    onTap: () =>
                        Navigator.of(context, rootNavigator: true).push(
                          CupertinoPageRoute<void>(
                            fullscreenDialog: true,
                            builder: (_) => WelcomeScreen(
                              onFinished: () => Navigator.of(
                                context,
                                rootNavigator: true,
                              ).pop(),
                            ),
                          ),
                        ),
                  ),
                ],
              ),

            // 2. Music Preferences
            AMSection(
              header: 'Music Preferences',
              footer: 'These shape Home, Quick Picks and regional charts.',
              children: [
                AMRow(
                  title: 'Music Region',
                  value: '${country.flag} ${country.name}',
                  chevron: true,
                  onTap: () => showRegionPickerSheet(context),
                ),
                AMRow(
                  title: 'Languages',
                  subtitle: summary(prefs?.languages, 'Not set'),
                  chevron: true,
                  onTap: () => showLanguagesPickerSheet(context),
                ),
                AMRow(
                  title: 'Genres & Vibes',
                  subtitle: summary(prefs?.genres, 'Not set'),
                  chevron: true,
                  onTap: () => showGenresPickerSheet(context),
                ),
                AMRow(
                  title: 'Favorite Artists',
                  subtitle: summary(
                    prefs?.favoriteArtists.map((a) => a.name),
                    'Not set',
                  ),
                  chevron: true,
                  onTap: () => showArtistsPickerSheet(context),
                ),
                AMRow(
                  title: 'Guided Setup',
                  subtitle: 'Re-run taste onboarding anytime',
                  chevron: true,
                  onTap: () => OnboardingSheet.show(context, isEditing: true),
                ),
              ],
            ),

            // 3. Your Music
            AMSection(
              header: 'Your Music',
              children: [
                AMRow(
                  title: 'Replay & Insights',
                  subtitle: 'Your listening statistics and highlights',
                  chevron: true,
                  onTap: () => Navigator.of(context).push(
                    CupertinoPageRoute<void>(
                      builder: (_) => const ReplayScreen(),
                    ),
                  ),
                ),
              ],
            ),

            // 4. Social
            AMSection(
              header: 'Social',
              children: [
                AMRow(
                  title: 'Room Together',
                  subtitle: 'Listen with friends in real time',
                  chevron: true,
                  onTap: () => Navigator.of(context).push(
                    CupertinoPageRoute<void>(
                      builder: (_) => const RoomTogetherScreen(),
                    ),
                  ),
                ),
              ],
            ),

            // 5. Account & Security
            if (auth.isLoggedIn)
              AMSection(
                header: 'Account & Security',
                footer:
                    'Export includes your playlists, preferences and listening stats.',
                children: [
                  AMRow(
                    title: 'Active Sessions',
                    subtitle: 'Devices signed in to your account',
                    chevron: true,
                    onTap: () => _showSessions(context),
                  ),
                  AMRow(
                    title: 'Export My Data',
                    chevron: true,
                    onTap: () => _exportData(context),
                  ),
                  AMRow(
                    title: 'Clear Listening History',
                    subtitle: 'Reset personal playback history and stats',
                    titleColor: AM.rose,
                    onTap: () => _confirmClearHistory(
                      context,
                      context.read<SettingsState>(),
                    ),
                  ),
                ],
              ),

            // 6. Sign Out
            if (auth.isLoggedIn)
              AMSection(
                children: [
                  AMRow(
                    title: 'Sign Out',
                    titleColor: AM.rose,
                    subtitle: user?.email,
                    onTap: () => _confirm(
                      context,
                      title: 'Sign Out',
                      message: 'Are you sure you want to sign out of Zenify?',
                      action: 'Sign Out',
                      onConfirm: auth.signOut,
                    ),
                  ),
                ],
              ),

            // 7. Delete Account
            if (auth.isLoggedIn)
              AMSection(
                children: [
                  AMRow(
                    title: 'Delete Account',
                    titleColor: AM.rose,
                    subtitle: 'Permanently remove your account and data',
                    onTap: () => _confirm(
                      context,
                      title: 'Delete Account',
                      message:
                          'This is permanent. Playlists, favorites and preferences will be deleted.',
                      action: 'Delete',
                      onConfirm: () async {
                        final token = await AuthService.instance
                            .getAccessToken();
                        if (token != null) {
                          await http.delete(
                            Uri.parse('${ApiService.baseUrl}/api/me/account'),
                            headers: {'Authorization': 'Bearer $token'},
                          );
                        }
                        auth.signOut();
                      },
                    ),
                  ),
                ],
              ),
          ],
        );
      },
    );
  }

  Future<void> _confirm(
    BuildContext context, {
    required String title,
    required String message,
    required String action,
    required FutureOr<void> Function() onConfirm,
  }) async {
    final ok = await ZenDropdown.showConfirmSheet(
      context: context,
      title: title,
      message: message,
      confirmLabel: action,
      isDestructive: true,
      icon: CupertinoIcons.exclamationmark_triangle,
    );
    if (ok) {
      await onConfirm();
    }
  }

  Future<void> _confirmClearHistory(
    BuildContext context,
    SettingsState s,
  ) async {
    final ok = await ZenDropdown.showConfirmSheet(
      context: context,
      title: 'Clear Listening History',
      message:
          'This permanently resets your listening events, stats and Replay history on all devices.',
      confirmLabel: 'Clear History',
      isDestructive: true,
      icon: CupertinoIcons.trash,
    );
    if (ok && context.mounted) {
      final done = await s.clearListeningHistory();
      if (context.mounted) {
        appleToast(
          context,
          done ? 'Listening history cleared' : 'Could not clear history',
          icon: done
              ? CupertinoIcons.checkmark_circle_fill
              : CupertinoIcons.exclamationmark_circle,
        );
      }
    }
  }

  Future<void> _showSessions(BuildContext context) async {
    final token = await AuthService.instance.getAccessToken();
    if (token == null || !context.mounted) return;
    showAMSheet<void>(context, (_) => _SessionsSheet(token: token));
  }

  Future<void> _exportData(BuildContext context) async {
    final token = await AuthService.instance.getAccessToken();
    if (token == null) return;
    try {
      final res = await http.get(
        Uri.parse('${ApiService.baseUrl}/api/me/export'),
        headers: {'Authorization': 'Bearer $token'},
      );
      if (res.statusCode == 200 && context.mounted) {
        appleToast(
          context,
          'Data archive export is ready',
          icon: CupertinoIcons.checkmark_circle_fill,
        );
      }
    } catch (_) {}
  }
}

class _SessionsSheet extends StatefulWidget {
  const _SessionsSheet({required this.token});
  final String token;

  @override
  State<_SessionsSheet> createState() => _SessionsSheetState();
}

class _SessionsSheetState extends State<_SessionsSheet> {
  late Future<List<Map<String, dynamic>>?> _future = _load();

  Map<String, String> get _headers => {
    'Authorization': 'Bearer ${widget.token}',
  };

  Future<List<Map<String, dynamic>>?> _load() async {
    try {
      final r = await http.get(
        Uri.parse('${ApiService.baseUrl}/api/me/sessions'),
        headers: _headers,
      );
      if (r.statusCode != 200) return null;
      return (jsonDecode(r.body) as List<dynamic>).cast<Map<String, dynamic>>();
    } catch (_) {
      return null;
    }
  }

  Future<void> _revoke(Object? id) async {
    try {
      await http.delete(
        Uri.parse('${ApiService.baseUrl}/api/me/sessions/$id'),
        headers: _headers,
      );
    } catch (_) {}
    if (mounted) {
      setState(() {
        _future = _load();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AMSheetFrame(
      title: 'Active Sessions',
      heightFactor: 0.6,
      body: FutureBuilder<List<Map<String, dynamic>>?>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CupertinoActivityIndicator());
          }
          final list = snap.data;
          if (list == null) {
            return const Center(
              child: Text(
                'Could not load sessions',
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  color: AM.label2,
                  fontSize: 15,
                ),
              ),
            );
          }
          return ListView(
            physics: const BouncingScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: [
              AMSection(
                footer:
                    '${list.length} signed-in device${list.length == 1 ? '' : 's'}',
                children: [
                  for (final s in list)
                    AMRow(
                      title: (s['deviceName'] as String?) ?? 'Device',
                      subtitle: s['isCurrent'] == true
                          ? '${s['platform'] ?? 'Mobile'} · This device'
                          : '${s['platform'] ?? 'Mobile'}',
                      trailing: s['isCurrent'] == true
                          ? null
                          : CupertinoButton(
                              padding: EdgeInsets.zero,
                              minimumSize: const Size(28, 28),
                              onPressed: () => _revoke(s['id']),
                              child: const Text(
                                'Revoke',
                                style: TextStyle(
                                  fontFamily: 'SF Pro',
                                  color: AM.rose,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}
