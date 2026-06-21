import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:go_router/go_router.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  String _activeSection = 'audio';

  final List<Map<String, dynamic>> _sections = [
    {'id': 'audio', 'label': 'Audio', 'icon': LucideIcons.volume2},
    {'id': 'playback', 'label': 'Playback', 'icon': LucideIcons.play},
    {'id': 'aesthetics', 'label': 'Aesthetics', 'icon': LucideIcons.palette},
    {'id': 'notifications', 'label': 'Notifications', 'icon': LucideIcons.bell},
    {'id': 'privacy', 'label': 'Privacy', 'icon': LucideIcons.shield},
  ];

  Widget _buildSectionCard({
    required String title,
    required String subtitle,
    required IconData icon,
    required List<Widget> children,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 48),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.01),
        borderRadius: BorderRadius.circular(48),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: children,
        ),
      ),
    );
  }

  Widget _buildSettingRow({
    required String label,
    required String description,
    required IconData icon,
    required Widget trailing,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.transparent),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.white.withOpacity(0.4)),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: Colors.white.withOpacity(0.9),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  description,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                    color: Colors.white.withOpacity(0.5),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 16),
          trailing,
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            // Floating Dock Header
            Padding(
              padding: const EdgeInsets.only(top: 16, bottom: 16, left: 12, right: 12),
              child: Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: const Color(0xFF18181B).withOpacity(0.8),
                  borderRadius: BorderRadius.circular(32),
                  border: Border.all(color: Colors.white.withOpacity(0.1)),
                ),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      // Back Button
                      IconButton(
                        icon: const Icon(LucideIcons.arrowLeft, color: Colors.white, size: 18),
                        onPressed: () => context.pop(),
                      ),
                      Container(width: 1, height: 24, color: Colors.white.withOpacity(0.1), margin: const EdgeInsets.only(right: 8)),
                      ..._sections.map((section) {
                        final isActive = _activeSection == section['id'];
                        return GestureDetector(
                          onTap: () => setState(() => _activeSection = section['id']),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                            decoration: BoxDecoration(
                              color: isActive ? Colors.white.withOpacity(0.1) : Colors.transparent,
                              borderRadius: BorderRadius.circular(24),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  section['icon'],
                                  size: 15,
                                  color: isActive ? Colors.white : Colors.white.withOpacity(0.5),
                                ),
                                const SizedBox(width: 8),
                                Text(
                                  section['label'],
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: isActive ? Colors.white : Colors.white.withOpacity(0.5),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      }).toList(),
                    ],
                  ),
                ),
              ),
            ),

            // Content
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                child: Column(
                  children: [
                    if (_activeSection == 'audio')
                      _buildSectionCard(
                        title: 'Audio',
                        subtitle: 'Quality and playback gain management',
                        icon: LucideIcons.volume2,
                        children: [
                          _buildSettingRow(
                            label: 'Streaming Fidelity',
                            description: 'Balance between bandwidth and audio clarity',
                            icon: LucideIcons.cpu,
                            trailing: DropdownButton<String>(
                              value: 'high',
                              dropdownColor: const Color(0xFF111113),
                              underline: const SizedBox(),
                              icon: const Icon(LucideIcons.chevronDown, color: Colors.white54, size: 16),
                              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                              onChanged: (v) {},
                              items: const [
                                DropdownMenuItem(value: 'low', child: Text('Basic')),
                                DropdownMenuItem(value: 'high', child: Text('High')),
                                DropdownMenuItem(value: 'lossless', child: Text('Best')),
                              ],
                            ),
                          ),
                          _buildSettingRow(
                            label: 'Same Volume',
                            description: 'Keep the same volume for all songs',
                            icon: LucideIcons.zap,
                            trailing: Switch(
                              value: true,
                              onChanged: (v) {},
                              activeColor: const Color(0xFFE11D48),
                            ),
                          ),
                          _buildSettingRow(
                            label: 'Hide Bad Words',
                            description: "Don't show songs with bad language",
                            icon: LucideIcons.eyeOff,
                            trailing: Switch(
                              value: false,
                              onChanged: (v) {},
                              activeColor: const Color(0xFFE11D48),
                            ),
                          ),
                        ],
                      ),

                    if (_activeSection == 'playback')
                      _buildSectionCard(
                        title: 'Playback',
                        subtitle: 'How your music plays',
                        icon: LucideIcons.play,
                        children: [
                          _buildSettingRow(
                            label: 'Smooth Swaps',
                            description: 'Mix the end of one song into the next',
                            icon: LucideIcons.music,
                            trailing: Switch(
                              value: false,
                              onChanged: (v) {},
                              activeColor: const Color(0xFFE11D48),
                            ),
                          ),
                          _buildSettingRow(
                            label: 'Keep Playing',
                            description: 'Keep playing similar songs when your music ends',
                            icon: LucideIcons.repeat,
                            trailing: Switch(
                              value: true,
                              onChanged: (v) {},
                              activeColor: const Color(0xFFE11D48),
                            ),
                          ),
                        ],
                      ),

                    if (_activeSection == 'aesthetics')
                      _buildSectionCard(
                        title: 'Aesthetics',
                        subtitle: 'How the app looks',
                        icon: LucideIcons.palette,
                        children: [
                          _buildSettingRow(
                            label: 'Main Color',
                            description: 'Change the main color of the app',
                            icon: LucideIcons.zap,
                            trailing: DropdownButton<String>(
                              value: 'rose',
                              dropdownColor: const Color(0xFF111113),
                              underline: const SizedBox(),
                              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                              onChanged: (v) {},
                              items: const [
                                DropdownMenuItem(value: 'rose', child: Text('Rose')),
                                DropdownMenuItem(value: 'white', child: Text('White')),
                                DropdownMenuItem(value: 'violet', child: Text('Violet')),
                                DropdownMenuItem(value: 'cyan', child: Text('Cyan')),
                              ],
                            ),
                          ),
                          _buildSettingRow(
                            label: 'Global Player Layout',
                            description: 'Style for the main bottom player',
                            icon: LucideIcons.music,
                            trailing: DropdownButton<String>(
                              value: 'glassmorphism',
                              dropdownColor: const Color(0xFF111113),
                              underline: const SizedBox(),
                              style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                              onChanged: (v) {},
                              items: const [
                                DropdownMenuItem(value: 'normal', child: Text('Normal (Solid)')),
                                DropdownMenuItem(value: 'glassmorphism', child: Text('Glassmorphism')),
                              ],
                            ),
                          ),
                          _buildSettingRow(
                            label: 'Small Mode',
                            description: 'Show more items on the screen at once',
                            icon: LucideIcons.layers,
                            trailing: Switch(
                              value: false,
                              onChanged: (v) {},
                              activeColor: const Color(0xFFE11D48),
                            ),
                          ),
                        ],
                      ),

                    if (_activeSection == 'notifications')
                      _buildSectionCard(
                        title: 'Notifications',
                        subtitle: 'Alerts and updates',
                        icon: LucideIcons.bell,
                        children: [
                          _buildSettingRow(
                            label: 'Email Notifications',
                            description: 'Get general email updates',
                            icon: LucideIcons.mail,
                            trailing: Switch(
                              value: true,
                              onChanged: (v) {},
                              activeColor: const Color(0xFFE11D48),
                            ),
                          ),
                          _buildSettingRow(
                            label: 'New Music',
                            description: 'Alert me when artists I follow drop new songs',
                            icon: LucideIcons.radio,
                            trailing: Switch(
                              value: true,
                              onChanged: (v) {},
                              activeColor: const Color(0xFFE11D48),
                            ),
                          ),
                        ],
                      ),

                    if (_activeSection == 'privacy')
                      _buildSectionCard(
                        title: 'Privacy',
                        subtitle: 'Your safety and sharing',
                        icon: LucideIcons.shield,
                        children: [
                          _buildSettingRow(
                            label: 'Secret Mode',
                            description: "Hide what you're listening to from others",
                            icon: LucideIcons.lock,
                            trailing: Switch(
                              value: false,
                              onChanged: (v) {},
                              activeColor: const Color(0xFFE11D48),
                            ),
                          ),
                          _buildSettingRow(
                            label: 'Show Activity',
                            description: "Display what you're playing on your profile",
                            icon: LucideIcons.activity,
                            trailing: Switch(
                              value: true,
                              onChanged: (v) {},
                              activeColor: const Color(0xFFE11D48),
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
