import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../design_system/widgets/apple_glass.dart';
import '../../design_system/widgets/dynamic_island_header.dart';
import '../../design_system/widgets/pressable_scale.dart';
import '../../design_system/widgets/zen_button.dart';
import '../../design_system/zen.dart';
import '../../services/auth_state.dart';
import '../../services/cache_service.dart';
import '../../services/country_service.dart';
import '../../design_system/widgets/zen_dropdown.dart';
import '../player/studio_fx_sheet.dart';
import '../room_together/room_together_screen.dart';
import '../auth/welcome_screen.dart';
import '../settings/settings_screen.dart';
import '../insights/insights_screen.dart';
import '../../services/dock_visibility.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> with HideDocksMixin {
  final TextEditingController _nameCtrl = TextEditingController();
  final TextEditingController _userCtrl = TextEditingController();
  bool _savedFeedback = false;

  @override
  void initState() {
    super.initState();
    final auth = context.read<AuthState>();
    _nameCtrl.text = auth.user?.name ?? '';
    _userCtrl.text = auth.user?.username ?? '';
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _userCtrl.dispose();
    super.dispose();
  }

  void _saveProfile(AuthState auth) async {
    final name = _nameCtrl.text.trim();
    final user = _userCtrl.text.trim();
    if (name.isEmpty) return;

    HapticFeedback.lightImpact();
    await auth.updateProfile(name: name, username: user);
    setState(() {
      _savedFeedback = true;
    });
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => _savedFeedback = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthState>();
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
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Profile Header Card
                      _buildHeaderCard(auth, user),
                      const SizedBox(height: 18),

                      // Quick Navigation: Room Together & Studio FX
                      _buildQuickAccessSection(),
                      const SizedBox(height: 24),

                      // Audio Quality & Streaming Engine
                      _buildAudioSettingsSection(auth),
                      const SizedBox(height: 24),

                      // Music Region & Country (YouTube Music)
                      _buildRegionAndCountrySection(),
                      const SizedBox(height: 24),

                      // Account Details & Edit Section
                      _buildProfileEditSection(auth, user),
                      const SizedBox(height: 24),

                      // Cache & Media Storage
                      _buildCacheSection(),
                      const SizedBox(height: 24),

                      // App Information
                      _buildAppInfoSection(),
                      const SizedBox(height: 48),
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
              title: 'Account & Profile',
              showBack: true,
              onBack: () => Navigator.of(context).pop(),
              topPadding: topInset + 4,
              trailing: PressableScale(
                scale: 0.88,
                onTap: () {
                  HapticFeedback.lightImpact();
                  Navigator.push(
                    context,
                    ZenPageRoute(builder: (_) => const SettingsScreen()),
                  );
                },
                child: AppleGlass(
                  borderRadius: BorderRadius.circular(22),
                  tint: const Color(0x26121216),
                  child: const SizedBox(
                    width: 44,
                    height: 44,
                    child: Center(
                      child: Icon(Icons.settings_outlined, color: Colors.white, size: 20),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderCard(AuthState auth, UserProfile? user) {
    final initial = (user?.name.isNotEmpty == true ? user!.name[0] : 'Z').toUpperCase();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
      ),
      child: Column(
        children: [
          Stack(
            children: [
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Zen.rose, const Color(0xFF861E30)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: Zen.rose.withValues(alpha: 0.35),
                      blurRadius: 18,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: Text(
                  initial,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              Positioned(
                bottom: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(
                    color: const Color(0xFF141416),
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                  ),
                  child: const Icon(Icons.camera_alt_rounded, color: Colors.white70, size: 14),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            user?.name ?? 'Zenify Guest',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.4,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            '@${user?.username ?? "guest"} • ${user?.email ?? "Offline"}',
            style: TextStyle(color: Zen.textMuted, fontSize: 13),
          ),
          const SizedBox(height: 12),

          // Hi-Fi Master Badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: Zen.rose.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Zen.rose.withValues(alpha: 0.35)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.workspace_premium_rounded, color: Zen.rose, size: 14),
                const SizedBox(width: 6),
                Text(
                  user?.tier.toUpperCase() ?? 'ZENIFY HI-FI',
                  style: TextStyle(
                    color: Zen.rose,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
          ),
          if (!auth.isLoggedIn) ...[
            const SizedBox(height: 16),
            ZenButton(
              label: 'SIGN IN / REGISTER',
              icon: Icons.login_rounded,
              width: double.infinity,
              onTap: () {
                Navigator.push(
                  context,
                  ZenPageRoute(
                    fullscreenDialog: true,
                    builder: (_) => WelcomeScreen(onFinished: () => Navigator.of(context).pop()),
                  ),
                );
              },
            ),
          ] else ...[
            const SizedBox(height: 16),
            ZenButton(
              label: 'SIGN OUT',
              icon: Icons.logout_rounded,
              width: double.infinity,
              onTap: () => _confirmSignOut(auth),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildQuickAccessSection() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: ZenButton(
                label: 'INSIGHTS & REPLAY',
                icon: Icons.insights_rounded,
                onTap: () {
                  Navigator.push(
                    context,
                    ZenPageRoute(builder: (_) => const InsightsScreen()),
                  );
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ZenButton(
                label: 'FULL SETTINGS',
                icon: Icons.settings_rounded,
                onTap: () {
                  Navigator.push(
                    context,
                    ZenPageRoute(builder: (_) => const SettingsScreen()),
                  );
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: ZenButton(
                label: 'ROOM TOGETHER',
                icon: Icons.groups_rounded,
                onTap: () {
                  Navigator.push(
                    context,
                    ZenPageRoute(builder: (_) => const RoomTogetherScreen()),
                  );
                },
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ZenButton(
                label: 'STUDIO FX',
                icon: Icons.equalizer_rounded,
                onTap: () => showStudioFxSheet(context),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildAudioSettingsSection(AuthState auth) {
    return _SettingsCard(
      title: 'AUDIO & PLAYBACK',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'STREAMING ENGINE',
            style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.0),
          ),
          const SizedBox(height: 8),
          _buildQualityOption(
            title: 'High Quality (InnerTube HQ)',
            subtitle: 'Ultra-low latency, crystal-clear 256k AAC streaming',
            value: 'high',
            selected: auth.audioQuality == 'high' || auth.audioQuality == '320k' || auth.audioQuality == 'yt-direct',
            onTap: () => auth.setAudioQuality('high'),
          ),
          const SizedBox(height: 8),
          _buildQualityOption(
            title: 'Standard Quality',
            subtitle: 'Efficient data-saving 128k/160k audio stream',
            value: 'standard',
            selected: auth.audioQuality == 'standard',
            onTap: () => auth.setAudioQuality('standard'),
          ),
          const SizedBox(height: 8),
          _buildQualityOption(
            title: 'Lossless FLAC Master',
            subtitle: 'Uncompressed audio stream up to 24-bit 96kHz',
            value: 'flac',
            selected: auth.audioQuality == 'flac',
            onTap: () => auth.setAudioQuality('flac'),
          ),
          const SizedBox(height: 16),
          const Divider(color: Colors.white12, height: 1),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Fluid Artwork Mesh', style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 2),
                  Text('Liquid Apple-style background grading', style: TextStyle(color: Zen.textMuted, fontSize: 12)),
                ],
              ),
              CupertinoSwitch(
                activeTrackColor: Zen.rose,
                value: auth.enableMeshBackground,
                onChanged: (v) => auth.toggleMeshBackground(v),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQualityOption({
    required String title,
    required String subtitle,
    required String value,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return PressableScale(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? Zen.rose.withValues(alpha: 0.12) : Colors.white.withValues(alpha: 0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? Zen.rose.withValues(alpha: 0.4) : Colors.white.withValues(alpha: 0.08),
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? Zen.rose : Colors.white38,
              size: 18,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      color: selected ? Colors.white : Colors.white70,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    subtitle,
                    style: TextStyle(color: Zen.textMuted, fontSize: 11),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildRegionAndCountrySection() {
    return ValueListenableBuilder<CountryInfo>(
      valueListenable: CountryService.instance.countryNotifier,
      builder: (context, country, _) {
        return _SettingsCard(
          title: 'MUSIC REGION & CHARTS',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'CONTENT REGION (YOUTUBE MUSIC)',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.0,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Determines regional charts, top artists, trending releases, and home recommendations.',
                style: TextStyle(color: Zen.textMuted, fontSize: 12),
              ),
              const SizedBox(height: 12),
              PressableScale(
                onTap: () {
                  ZenDropdown.show(
                    context: context,
                    title: 'Select Region / Country',
                    subtitle: 'Changes regional music & charts',
                    items: [
                      for (final c in CountryService.supportedCountries)
                        ZenDropdownItem(
                          title: '${c.flag}  ${c.name} (${c.code})',
                          icon: CupertinoIcons.globe,
                          isSelected: c.code == country.code,
                          onTap: () async {
                            await CountryService.instance.setCountry(c);
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  content: Text('Music region switched to ${c.displayName}'),
                                  duration: const Duration(seconds: 2),
                                  backgroundColor: const Color(0xFF18181B),
                                ),
                              );
                            }
                          },
                        ),
                    ],
                  );
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                  ),
                  child: Row(
                    children: [
                      Text(
                        country.flag,
                        style: const TextStyle(fontSize: 22),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              country.name,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Region Code: ${country.code}',
                              style: TextStyle(color: Zen.textMuted, fontSize: 12),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.unfold_more_rounded, color: Colors.white70, size: 20),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildProfileEditSection(AuthState auth, UserProfile? user) {
    return _SettingsCard(
      title: 'PROFILE DETAILS',
      trailing: _savedFeedback
          ? Text('SAVED ✓', style: TextStyle(color: Zen.rose, fontSize: 10, fontWeight: FontWeight.bold))
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildEditField(label: 'Full Name', controller: _nameCtrl),
          const SizedBox(height: 12),
          _buildEditField(label: 'Username', controller: _userCtrl),
          const SizedBox(height: 16),
          ZenButton(
            label: 'SAVE PROFILE',
            compact: true,
            onTap: () => _saveProfile(auth),
          ),
        ],
      ),
    );
  }

  Widget _buildEditField({required String label, required TextEditingController controller}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label.toUpperCase(),
          style: TextStyle(color: Zen.textMuted, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1.0),
        ),
        const SizedBox(height: 6),
        Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.white.withValues(alpha: 0.10)),
          ),
          child: TextField(
            controller: controller,
            style: const TextStyle(color: Colors.white, fontSize: 14),
            decoration: const InputDecoration(border: InputBorder.none, isDense: true),
          ),
        ),
      ],
    );
  }

  Widget _buildCacheSection() {
    return _SettingsCard(
      title: 'CACHE & MEDIA STORAGE',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Purge all cached artwork, artist profiles, and songs to fetch freshly from YouTube Music.',
            style: TextStyle(color: Zen.textMuted, fontSize: 12, height: 1.4),
          ),
          const SizedBox(height: 14),
          ZenButton(
            label: 'CLEAR ALL CACHE & RELOAD',
            compact: true,
            onTap: () async {
              HapticFeedback.mediumImpact();
              await CacheService.clearAllMediaAndArtworkCache();
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Cache purged! Fetching freshly from YouTube Music...'),
                    duration: Duration(seconds: 2),
                  ),
                );
              }
            },
          ),
        ],
      ),
    );
  }

  Widget _buildAppInfoSection() {
    return _SettingsCard(
      title: 'SYSTEM & APPLICATION',
      child: Column(
        children: [
          _infoRow('Version', '2.4.0 (Build 2026.11)'),
          const SizedBox(height: 8),
          _infoRow('Audio Engine', 'Hardware DSP (Neon & SSE)'),
          const SizedBox(height: 8),
          _infoRow('Cloud Backend', 'Heroku Edge CDN (Fastify 4.28)'),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(color: Zen.textMuted, fontSize: 12)),
        Text(value, style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w500)),
      ],
    );
  }

  void _confirmSignOut(AuthState auth) {
    showCupertinoDialog<void>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: const Text('Sign Out'),
        content: const Text('Are you sure you want to sign out from Zenify?'),
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

class _SettingsCard extends StatelessWidget {
  const _SettingsCard({required this.title, required this.child, this.trailing});
  final String title;
  final Widget child;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF18181B),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.6),
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1.2,
                ),
              ),
              ?trailing,
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}
