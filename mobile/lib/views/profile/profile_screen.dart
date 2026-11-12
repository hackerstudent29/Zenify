import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/apple/apple_kit.dart';
import '../../design_system/apple/apple_tokens.dart';
import '../../services/auth_state.dart';
import '../../services/country_service.dart';
import '../../services/dock_visibility.dart';
import '../../services/user_preferences_service.dart';
import '../auth/onboarding_sheet.dart';
import '../auth/welcome_screen.dart';
import '../insights/insights_screen.dart';
import '../player/studio_fx_sheet.dart';
import '../room_together/room_together_screen.dart';
import '../settings/settings_screen.dart';
import 'profile_edit_sheets.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> with HideDocksMixin {
  @override
  bool get hideMiniPlayerWhileActive => true;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
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
            final handleParts = <String>[
              if (user?.username != null &&
                  user!.username.trim().isNotEmpty &&
                  user.username != 'guest')
                '@${user.username.trim()}',
              if (user?.email != null && user!.email.trim().isNotEmpty)
                user.email.trim(),
            ];
            final subtitleLine = handleParts.isNotEmpty
                ? handleParts.join(' · ')
                : (auth.isLoggedIn ? 'Zenify Member' : 'Guest Listener');

            final langSummary = prefs != null && prefs.languages.isNotEmpty
                ? prefs.languages.join(', ')
                : 'Not set';
            final genreSummary = prefs != null && prefs.genres.isNotEmpty
                ? prefs.genres.join(', ')
                : 'Not set';
            final artistSummary = prefs != null && prefs.favoriteArtists.isNotEmpty
                ? prefs.favoriteArtists.map((a) => a.name).join(', ')
                : 'Not set';

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
                        const Spacer(),
                        CircleIconButton(
                          icon: CupertinoIcons.gear_alt_fill,
                          tooltip: 'Settings',
                          onTap: () => Navigator.of(context).push(
                            CupertinoPageRoute<void>(
                              builder: (_) => const SettingsScreen(),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // Hero identity block (no overlapping cards)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 18, 20, 22),
                    child: Column(
                      children: [
                        Avatar(
                          name: displayName,
                          size: 80,
                          ring: AT.accent.withValues(alpha: 0.45),
                        ),
                        const SizedBox(height: 14),
                        Text(
                          displayName,
                          style: AT.title1,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          subtitleLine,
                          style: AT.subhead,
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            PillButton(
                              label: 'Edit Profile',
                              icon: CupertinoIcons.pencil,
                              compact: true,
                              style: PillStyle.glass,
                              onTap: () => showIdentityEditSheet(context),
                            ),
                            const SizedBox(width: 10),
                            if (!auth.isLoggedIn)
                              PillButton(
                                label: 'Sign In',
                                icon: CupertinoIcons.person_crop_circle_badge_plus,
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
                              )
                            else
                              PillButton(
                                label: 'Sign Out',
                                icon: CupertinoIcons.square_arrow_left,
                                compact: true,
                                style: PillStyle.tinted,
                                onTap: () => _confirmSignOut(auth),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),

                // Quick Actions strip (Room Together style glass pills)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 22),
                    child: Row(
                      children: [
                        Expanded(
                          child: PillButton(
                            label: 'Replay',
                            icon: CupertinoIcons.chart_bar_fill,
                            compact: true,
                            style: PillStyle.glass,
                            onTap: () => Navigator.of(context).push(
                              CupertinoPageRoute<void>(
                                builder: (_) => const InsightsScreen(),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: PillButton(
                            label: 'Together',
                            icon: CupertinoIcons.person_2_fill,
                            compact: true,
                            style: PillStyle.glass,
                            onTap: () => Navigator.of(context).push(
                              CupertinoPageRoute<void>(
                                builder: (_) => const RoomTogetherScreen(),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: PillButton(
                            label: 'Studio FX',
                            icon: CupertinoIcons.waveform,
                            compact: true,
                            style: PillStyle.glass,
                            onTap: () => showStudioFxSheet(context),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // Personal Identity Section
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'IDENTITY',
                    children: [
                      AppleRow(
                        leading: const IconTile(
                          CupertinoIcons.person_fill,
                          color: AT.accent,
                        ),
                        title: 'Name & Username',
                        subtitle: displayName,
                        trailing: const _RowChevron(),
                        onTap: () => showIdentityEditSheet(context),
                      ),
                      AppleRow(
                        leading: const IconTile(
                          CupertinoIcons.calendar,
                          color: AT.blue,
                        ),
                        title: 'Age',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              prefs?.age != null ? '${prefs!.age}' : 'Add',
                              style: AT.subhead,
                            ),
                            const SizedBox(width: 6),
                            const _RowChevron(),
                          ],
                        ),
                        onTap: () => showIdentityEditSheet(context),
                      ),
                      AppleRow(
                        leading: const IconTile(
                          CupertinoIcons.person_2_fill,
                          color: AT.green,
                        ),
                        title: 'Gender',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              prefs?.gender ?? 'Add',
                              style: AT.subhead,
                            ),
                            const SizedBox(width: 6),
                            const _RowChevron(),
                          ],
                        ),
                        onTap: () => showIdentityEditSheet(context),
                      ),
                    ],
                  ),
                ),

                // Music Tastes & Region Section
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'MUSIC TASTES & REGION',
                    footer: 'Tap any row to edit your music preferences individually, or run the guided setup.',
                    children: [
                      AppleRow(
                        leading: Text(country.flag, style: const TextStyle(fontSize: 22)),
                        title: 'Music Region',
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(country.name, style: AT.subhead),
                            const SizedBox(width: 6),
                            const _RowChevron(),
                          ],
                        ),
                        onTap: () => showRegionPickerSheet(context),
                      ),
                      AppleRow(
                        leading: const IconTile(
                          CupertinoIcons.chat_bubble_2_fill,
                          color: AT.accent,
                        ),
                        title: 'Languages',
                        subtitle: langSummary,
                        trailing: const _RowChevron(),
                        onTap: () => showLanguagesPickerSheet(context),
                      ),
                      AppleRow(
                        leading: const IconTile(
                          CupertinoIcons.music_note_2,
                          color: AT.amber,
                        ),
                        title: 'Genres & Vibes',
                        subtitle: genreSummary,
                        trailing: const _RowChevron(),
                        onTap: () => showGenresPickerSheet(context),
                      ),
                      AppleRow(
                        leading: const IconTile(
                          CupertinoIcons.music_mic,
                          color: Color(0xFFBF5AF2),
                        ),
                        title: 'Favorite Artists',
                        subtitle: artistSummary,
                        trailing: const _RowChevron(),
                        onTap: () => showArtistsPickerSheet(context),
                      ),
                      AppleRow(
                        leading: const IconTile(
                          CupertinoIcons.sparkles,
                          color: AT.blue,
                        ),
                        title: 'Guided Setup Wizard',
                        subtitle: 'Step through all preferences cleanly',
                        trailing: const _RowChevron(),
                        onTap: () => OnboardingSheet.show(context, isEditing: true),
                      ),
                    ],
                  ),
                ),

                // App Preferences Shortcut
                SliverToBoxAdapter(
                  child: GroupedSection(
                    title: 'APPLICATION',
                    children: [
                      AppleRow(
                        leading: const IconTile(
                          CupertinoIcons.slider_horizontal_3,
                          color: Color(0xFF8E8E93),
                        ),
                        title: 'All Settings',
                        subtitle: 'Audio quality, playback, downloads & security',
                        trailing: const _RowChevron(),
                        onTap: () => Navigator.of(context).push(
                          CupertinoPageRoute<void>(
                            builder: (_) => const SettingsScreen(),
                          ),
                        ),
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

  void _confirmSignOut(AuthState auth) {
    HapticFeedback.mediumImpact();
    showCupertinoDialog<void>(
      context: context,
      useRootNavigator: true,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to sign out of Zenify?'),
        actions: [
          CupertinoDialogAction(
            child: const Text('Cancel'),
            onPressed: () => Navigator.pop(ctx),
          ),
          CupertinoDialogAction(
            isDestructiveAction: true,
            child: const Text('Sign Out'),
            onPressed: () {
              Navigator.pop(ctx);
              auth.signOut();
            },
          ),
        ],
      ),
    );
  }
}

class _RowChevron extends StatelessWidget {
  const _RowChevron();

  @override
  Widget build(BuildContext context) {
    return const Icon(CupertinoIcons.chevron_forward, size: 15, color: AT.label3);
  }
}
