import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
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
    this.isForceUpdate = false,
  });

  final bool hasUpdate;
  final String currentVersion;
  final int currentBuild;
  final String latestVersion;
  final String updateUrl;
  final String releaseNotes;
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
      final currentVersion = packageInfo.version.isNotEmpty ? packageInfo.version : '1.0.1';
      final currentBuild = int.tryParse(packageInfo.buildNumber) ?? 3;

      // Remote config candidates in priority order
      final urls = [
        '${ApiService.baseUrl}/remote_config.json',
        '${ApiService.liveCloudUrl}/remote_config.json',
        'https://raw.githubusercontent.com/hackerstudent29/Zenify/main/frontend/public/remote_config.json',
        'https://listenzenify.com/remote_config.json',
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
      final updateUrl = (configData['updateUrl'] ?? 'https://listenzenify.com/download/app').toString();
      final releaseNotes = (configData['releaseNotes'] ??
              '• YouTube Music InnerTube pure streaming pipeline\n• Android 14 back-swipe navigation fixes\n• Song dock & navbar dock auto-hidden on settings/profile/auth\n• In-app update checker & notification banner\n• Stability & performance improvements')
          .toString();

      final hasUpdate = isNewerVersion(latestAppVersion, currentVersion);
      final isForceUpdate = isNewerVersion(minAppVersion, currentVersion);

      final info = UpdateInfo(
        hasUpdate: hasUpdate,
        currentVersion: currentVersion,
        currentBuild: currentBuild,
        latestVersion: latestAppVersion,
        updateUrl: updateUrl,
        releaseNotes: releaseNotes,
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
    final targetUrl = url ?? availableUpdate?.updateUrl ?? 'https://listenzenify.com/download/app';
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
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return Container(
          padding: EdgeInsets.fromLTRB(24, 20, 24, MediaQuery.of(sheetContext).padding.bottom + 20),
          decoration: const BoxDecoration(
            color: Color(0xFF18181B),
            borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
            border: Border(
              top: BorderSide(color: Color(0x33FFFFFF), width: 0.8),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Grab handle
              Center(
                child: Container(
                  width: 38,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 20),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Title row with icon
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.crimson.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppColors.crimson.withValues(alpha: 0.3)),
                    ),
                    child: const Icon(Icons.system_update_rounded, color: AppColors.crimson, size: 24),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'UPDATE AVAILABLE',
                          style: GoogleFonts.oswald(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: 0.8,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.crimson,
                                borderRadius: BorderRadius.circular(5),
                              ),
                              child: Text(
                                'v${info.latestVersion}',
                                style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              'Installed: v${info.currentVersion}',
                              style: const TextStyle(
                                fontSize: 11,
                                color: Color(0xFFA1A1AA),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Release notes container
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF121214),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      "WHAT'S NEW",
                      style: GoogleFonts.oswald(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppColors.crimson,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      info.releaseNotes,
                      style: const TextStyle(
                        fontSize: 12.5,
                        color: Color(0xFFE4E4E7),
                        height: 1.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Action buttons
              Row(
                children: [
                  if (!info.isForceUpdate) ...[
                    Expanded(
                      flex: 1,
                      child: GestureDetector(
                        onTap: () {
                          dismissPrompt();
                          Navigator.of(sheetContext).pop();
                        },
                        child: Container(
                          height: 48,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.06),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                          ),
                          alignment: Alignment.center,
                          child: const Text(
                            'LATER',
                            style: TextStyle(
                              fontSize: 11,
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
                    flex: 2,
                    child: GestureDetector(
                      onTap: () {
                        HapticFeedback.heavyImpact();
                        Navigator.of(sheetContext).pop();
                        launchUpdate(info.updateUrl);
                      },
                      child: Container(
                        height: 48,
                        decoration: BoxDecoration(
                          color: AppColors.crimson,
                          borderRadius: BorderRadius.circular(14),
                          boxShadow: [
                            BoxShadow(
                              color: AppColors.crimson.withValues(alpha: 0.4),
                              blurRadius: 16,
                              offset: const Offset(0, 4),
                            ),
                          ],
                        ),
                        alignment: Alignment.center,
                        child: const Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.download_rounded, color: Colors.white, size: 18),
                            SizedBox(width: 8),
                            Text(
                              'UPDATE NOW',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                                letterSpacing: 1.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    ).whenComplete(() {
      DockVisibility.hideDocksNotifier.value = false;
    });
  }
}
