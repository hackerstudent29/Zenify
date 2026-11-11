import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';

import '../../design_system/tokens/app_colors.dart';
import 'api_service.dart';
import 'dock_visibility.dart';

/// Information regarding the latest available app release.
class UpdateInfo {
  const UpdateInfo({
    required this.hasUpdate,
    required this.currentVersion,
    required this.currentBuild,
    required this.latestVersion,
    required this.updateUrl,
    required this.releaseNotes,
    this.releaseDate = 'November 11, 2026',
    this.releaseTime = '09:50 AM IST',
    this.features = const [],
    this.fixes = const [],
    this.improvements = const [],
    this.isForceUpdate = false,
  });

  final bool hasUpdate;
  final String currentVersion;
  final int currentBuild;
  final String latestVersion;
  final String updateUrl;
  final String releaseNotes;
  final String releaseDate;
  final String releaseTime;
  final List<String> features;
  final List<String> fixes;
  final List<String> improvements;
  final bool isForceUpdate;
}

/// Service that checks for remote app updates and provides dialogs & update triggers.
class UpdateService {
  UpdateService._();
  static final UpdateService instance = UpdateService._();

  static const MethodChannel _appChannel = MethodChannel('com.zenify.mobile/app');

  final ValueNotifier<UpdateInfo?> availableUpdateNotifier = ValueNotifier<UpdateInfo?>(null);
  UpdateInfo? get availableUpdate => availableUpdateNotifier.value;

  bool _isChecking = false;
  bool get isChecking => _isChecking;

  bool _hasDismissedPrompt = false;
  bool get hasDismissedPrompt => _hasDismissedPrompt;

  void dismissPrompt() {
    _hasDismissedPrompt = true;
  }

  /// Compares [latest] semantic version against [current] installed version.
  /// Returns true if [latest] is strictly newer than [current].
  static bool isNewerVersion(String latest, String current) {
    try {
      final lClean = latest.trim().toLowerCase().replaceAll(RegExp(r'^v'), '').split('+')[0];
      final cClean = current.trim().toLowerCase().replaceAll(RegExp(r'^v'), '').split('+')[0];

      // If current is 1.0.x and remote returned legacy 2.x from previous repo, ignore
      if (cClean.startsWith('1.') && lClean.startsWith('2.')) {
        return false;
      }
      if (lClean == cClean) return false;

      final lParts = lClean.split('.').map((e) => int.tryParse(e) ?? 0).toList();
      final cParts = cClean.split('.').map((e) => int.tryParse(e) ?? 0).toList();

      final maxLen = math.max(lParts.length, cParts.length);
      for (int i = 0; i < maxLen; i++) {
        final l = i < lParts.length ? lParts[i] : 0;
        final c = i < cParts.length ? cParts[i] : 0;
        if (l > c) return true;
        if (l < c) return false;
      }
    } catch (_) {}
    return false;
  }

  /// Checks remote configuration for updates.
  Future<UpdateInfo?> checkForUpdate({bool silent = true}) async {
    if (_isChecking) return availableUpdate;
    _isChecking = true;

    try {
      final packageInfo = await PackageInfo.fromPlatform();
      final currentVersion = packageInfo.version.isNotEmpty ? packageInfo.version : '1.0.8';
      final currentBuild = int.tryParse(packageInfo.buildNumber) ?? 12;

      // Remote config candidates in priority order (raw GitHub first for instantaneous release updates)
      final urls = [
        'https://raw.githubusercontent.com/hackerstudent29/Zenify/main/frontend/public/remote_config.json',
        'https://listenzenify.com/remote_config.json',
        '${ApiService.baseUrl}/remote_config.json',
        '${ApiService.liveCloudUrl}/remote_config.json',
      ];

      Map<String, dynamic>? configData;

      for (final url in urls) {
        try {
          final res = await http.get(Uri.parse(url)).timeout(const Duration(seconds: 4));
          if (res.statusCode == 200) {
            final decoded = jsonDecode(utf8.decode(res.bodyBytes));
            if (decoded is Map<String, dynamic>) {
              configData = decoded;
              break;
            }
          }
        } catch (_) {}
      }

      if (configData == null) {
        _isChecking = false;
        return null;
      }

      final latestAppVersion = (configData['latestAppVersion'] ?? configData['version'] ?? currentVersion).toString();
      final minAppVersion = (configData['minAppVersion'] ?? '1.0.0').toString();
      final updateUrl = (configData['updateUrl'] ?? 'https://listenzenify.com/downloads/zenify.apk').toString();
      final releaseDate = (configData['releaseDate'] ?? 'November 11, 2026').toString();
      final releaseTime = (configData['releaseTime'] ?? '09:50 AM IST').toString();

      List<String> parseList(dynamic val) {
        if (val is List) return val.map((e) => e.toString()).toList();
        return const [];
      }

      final features = parseList(configData['features']);
      final fixes = parseList(configData['fixes']);
      final improvements = parseList(configData['improvements']);

      final releaseNotes = (configData['releaseNotes'] ??
              '• Native Apple San Francisco Pro (SF Pro) typography across all screens and sheets\n• Liquid Glass 3-Dock Morphing Island with circular stadium edges\n• Smart left dock button: one-tap restoration to normal dock and miniplayer state\n• Stability & performance improvements')
          .toString();

      final hasUpdate = isNewerVersion(latestAppVersion, currentVersion);
      // Force update if explicitly marked in remote config or if current is below minAppVersion
      final isForceUpdate = configData['isForceUpdate'] == true || isNewerVersion(minAppVersion, currentVersion);

      final info = UpdateInfo(
        hasUpdate: hasUpdate,
        currentVersion: currentVersion,
        currentBuild: currentBuild,
        latestVersion: latestAppVersion,
        updateUrl: updateUrl,
        releaseNotes: releaseNotes,
        releaseDate: releaseDate,
        releaseTime: releaseTime,
        features: features,
        fixes: fixes,
        improvements: improvements,
        isForceUpdate: isForceUpdate,
      );

      availableUpdateNotifier.value = info;
      _isChecking = false;
      return info;
    } catch (_) {
      _isChecking = false;
      return null;
    }
  }

  /// Opens the update download URL via native Android Intent.
  Future<bool> launchUpdate([String? url]) async {
    final targetUrl = url ?? availableUpdate?.updateUrl ?? 'https://listenzenify.com/downloads/zenify.apk';
    try {
      final success = await _appChannel.invokeMethod<bool>('openUrl', {'url': targetUrl});
      return success ?? true;
    } catch (_) {
      return false;
    }
  }

  /// Displays an Apple Music / Zenify styled modal bottom sheet detailing the update.
  void showUpdateSheet(BuildContext context, UpdateInfo info) {
    DockVisibility.hideDocksNotifier.value = true;
    showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      isScrollControlled: true,
      isDismissible: !info.isForceUpdate,
      enableDrag: !info.isForceUpdate,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: info.isForceUpdate ? 0.85 : 0.50),
      builder: (sheetContext) {
        return PopScope(
          canPop: !info.isForceUpdate,
          child: _UpdateSheetContent(info: info),
        );
      },
    ).whenComplete(() {
      DockVisibility.hideDocksNotifier.value = false;
    });
  }
}

class _UpdateSheetContent extends StatefulWidget {
  const _UpdateSheetContent({required this.info});
  final UpdateInfo info;

  @override
  State<_UpdateSheetContent> createState() => _UpdateSheetContentState();
}

class _UpdateSheetContentState extends State<_UpdateSheetContent> {
  bool _isAutoUpdating = false;

  void _triggerAutoUpdate() {
    setState(() => _isAutoUpdating = true);
    HapticFeedback.heavyImpact();
    UpdateService.instance.launchUpdate(widget.info.updateUrl);
  }

  @override
  Widget build(BuildContext context) {
    final info = widget.info;
    final maxHeight = MediaQuery.of(context).size.height * 0.88;

    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
      child: Container(
        constraints: BoxConstraints(maxHeight: maxHeight),
        padding: EdgeInsets.fromLTRB(22, 16, 22, MediaQuery.of(context).padding.bottom + 18),
        decoration: const BoxDecoration(
          color: Color(0xF21C1C1E),
          borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
          border: Border(
            top: BorderSide(color: Color(0x33FFFFFF), width: 0.6),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Grab handle (only if dismissible)
            if (!info.isForceUpdate)
              Center(
                child: Container(
                  width: 36,
                  height: 4.5,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(2.5),
                  ),
                ),
              )
            else
              const SizedBox(height: 6),

            // Header Row: App Update Icon + Title + Version + Mandatory Pill
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.crimson.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppColors.crimson.withValues(alpha: 0.35)),
                  ),
                  child: const Icon(Icons.system_update_rounded, color: AppColors.crimson, size: 26),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            info.isForceUpdate ? 'REQUIRED UPDATE' : 'UPDATE AVAILABLE',
                            style: const TextStyle(
                              fontFamily: 'SF Pro',
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              letterSpacing: 0.4,
                            ),
                          ),
                          if (info.isForceUpdate) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.crimson.withValues(alpha: 0.22),
                                borderRadius: BorderRadius.circular(6),
                                border: Border.all(color: AppColors.crimson.withValues(alpha: 0.6)),
                              ),
                              child: const Text(
                                'MANDATORY',
                                style: TextStyle(
                                  fontFamily: 'SF Pro',
                                  fontSize: 9,
                                  fontWeight: FontWeight.w900,
                                  color: AppColors.crimson,
                                  letterSpacing: 0.8,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.crimson,
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              'v${info.latestVersion}',
                              style: const TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 10.5,
                                fontWeight: FontWeight.w800,
                                color: Colors.white,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Text(
                            'Installed: v${info.currentVersion}',
                            style: TextStyle(
                              fontFamily: 'SF Pro',
                              fontSize: 11.5,
                              color: Colors.white.withValues(alpha: 0.55),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),

            // Date & Time stamp badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.05),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.schedule_rounded, size: 13, color: Colors.white.withValues(alpha: 0.65)),
                  const SizedBox(width: 6),
                  Text(
                    'Released ${info.releaseDate} at ${info.releaseTime}',
                    style: TextStyle(
                      fontFamily: 'SF Pro',
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: Colors.white.withValues(alpha: 0.75),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Scrollable Changelog details
            Flexible(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // 1. Features
                    if (info.features.isNotEmpty)
                      _buildSectionCard(
                        icon: Icons.auto_awesome_rounded,
                        title: "WHAT'S NEW",
                        accentColor: const Color(0xFFFF375F),
                        items: info.features,
                      ),

                    // 2. Fixes
                    if (info.fixes.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _buildSectionCard(
                        icon: Icons.build_circle_rounded,
                        title: 'FIXES & RESOLUTIONS',
                        accentColor: const Color(0xFF30D158),
                        items: info.fixes,
                      ),
                    ],

                    // 3. Improvements
                    if (info.improvements.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _buildSectionCard(
                        icon: Icons.bolt_rounded,
                        title: 'PERFORMANCE & ARCHITECTURE',
                        accentColor: const Color(0xFF0A84FF),
                        items: info.improvements,
                      ),
                    ],

                    // Fallback to plain release notes if lists are empty
                    if (info.features.isEmpty && info.fixes.isEmpty && info.improvements.isEmpty)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: const Color(0xFF141416),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              "CHANGES IN THIS RELEASE",
                              style: TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 11,
                                fontWeight: FontWeight.w800,
                                color: AppColors.crimson,
                                letterSpacing: 0.6,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              info.releaseNotes,
                              style: const TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 12.5,
                                color: Color(0xFFE4E4E7),
                                height: 1.5,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            ),

            const SizedBox(height: 20),

            // Bottom Action Controls
            Row(
              children: [
                if (!info.isForceUpdate) ...[
                  Expanded(
                    flex: 1,
                    child: GestureDetector(
                      onTap: () {
                        UpdateService.instance.dismissPrompt();
                        Navigator.of(context).pop();
                      },
                      child: Container(
                        height: 50,
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                        ),
                        alignment: Alignment.center,
                        child: const Text(
                          'LATER',
                          style: TextStyle(
                            fontFamily: 'SF Pro',
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFFA1A1AA),
                            letterSpacing: 1.2,
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                ],
                Expanded(
                  flex: info.isForceUpdate ? 1 : 2,
                  child: GestureDetector(
                    onTap: _isAutoUpdating ? null : _triggerAutoUpdate,
                    child: Container(
                      height: 50,
                      decoration: BoxDecoration(
                        color: AppColors.crimson,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: AppColors.crimson.withValues(alpha: 0.45),
                            blurRadius: 18,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      alignment: Alignment.center,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          if (_isAutoUpdating) ...[
                            const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            ),
                            const SizedBox(width: 10),
                            const Text(
                              'STARTING UPDATE...',
                              style: TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 12.5,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ] else ...[
                            const Icon(Icons.download_rounded, color: Colors.white, size: 20),
                            const SizedBox(width: 8),
                            Text(
                              info.isForceUpdate ? 'UPDATE TO CONTINUE' : 'AUTO UPDATE NOW',
                              style: const TextStyle(
                                fontFamily: 'SF Pro',
                                fontSize: 12.5,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionCard({
    required IconData icon,
    required String title,
    required Color accentColor,
    required List<String> items,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF141416),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 14, color: accentColor),
              const SizedBox(width: 6),
              Text(
                title,
                style: TextStyle(
                  fontFamily: 'SF Pro',
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  color: accentColor,
                  letterSpacing: 0.8,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...items.map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    margin: const EdgeInsets.only(top: 6, right: 8),
                    width: 4,
                    height: 4,
                    decoration: BoxDecoration(
                      color: accentColor.withValues(alpha: 0.8),
                      shape: BoxShape.circle,
                    ),
                  ),
                  Expanded(
                    child: Text(
                      item,
                      style: const TextStyle(
                        fontFamily: 'SF Pro',
                        fontSize: 12.5,
                        color: Color(0xFFE4E4E7),
                        height: 1.45,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
