import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'api_service.dart';
import 'auth_service.dart';

class SettingsState extends ChangeNotifier {
  SettingsState._();

  static final SettingsState instance = SettingsState._();

  late SharedPreferences _prefs;
  bool _isInitialized = false;
  bool get isInitialized => _isInitialized;

  Timer? _debounceTimer;
  final Map<String, String> _syncTimestamps = {};

  // ==================== AUDIO SETTINGS ====================
  // 128 | 256 | 320 (low, high, lossless)
  String _wifiQuality = 'lossless';
  String get wifiQuality => _wifiQuality;

  String _cellularQuality = 'high';
  String get cellularQuality => _cellularQuality;

  String _downloadQuality = 'lossless';
  String get downloadQuality => _downloadQuality;

  bool _normalizeVolume = true;
  bool get normalizeVolume => _normalizeVolume;

  bool _explicitFilter = false;
  bool get explicitFilter => _explicitFilter;

  bool _monoAudio = false;
  bool get monoAudio => _monoAudio;

  bool _gaplessPlayback = true;
  bool get gaplessPlayback => _gaplessPlayback;

  // ==================== PLAYBACK SETTINGS ====================
  // 0 to 12 seconds crossfade (0 = off)
  int _crossfadeSeconds = 0;
  int get crossfadeSeconds => _crossfadeSeconds;

  bool _autoplaySimilar = true;
  bool get autoplaySimilar => _autoplaySimilar;

  bool _autoHideDetails = true;
  bool get autoHideDetails => _autoHideDetails;

  // Sleep timer minutes: 0 means inactive
  int _sleepTimerMinutes = 0;
  int get sleepTimerMinutes => _sleepTimerMinutes;

  bool _pauseOnDisconnect = true;
  bool get pauseOnDisconnect => _pauseOnDisconnect;

  bool _resumeWhereLeftOff = true;
  bool get resumeWhereLeftOff => _resumeWhereLeftOff;

  // original | tanglish | hinglish
  String _lyricsDefaultScript = 'original';
  String get lyricsDefaultScript => _lyricsDefaultScript;

  double _lyricsScale = 1.0;
  double get lyricsScale => _lyricsScale;

  // ==================== AESTHETICS SETTINGS ====================
  // red | crimson | rose | cyan | emerald | violet | amber
  String _accentColor = 'crimson';
  String get accentColor => _accentColor;

  bool _dynamicAlbumColors = true;
  bool get dynamicAlbumColors => _dynamicAlbumColors;

  bool _fluidMeshBg = true;
  bool get fluidMeshBg => _fluidMeshBg;

  bool _reduceMotion = false;
  bool get reduceMotion => _reduceMotion;

  // system | dark | light
  String _themeMode = 'dark';
  String get themeMode => _themeMode;

  bool _glassEffects = true;
  bool get glassEffects => _glassEffects;

  bool _hapticsEnabled = true;
  bool get hapticsEnabled => _hapticsEnabled;

  // ==================== NOTIFICATIONS ====================
  bool _emailNotifications = false;
  bool get emailNotifications => _emailNotifications;

  bool _weeklySummaryEmail = false;
  bool get weeklySummaryEmail => _weeklySummaryEmail;

  bool _newReleaseAlerts = true;
  bool get newReleaseAlerts => _newReleaseAlerts;

  bool _playlistUpdates = true;
  bool get playlistUpdates => _playlistUpdates;

  bool _notifyBlendUpdates = true;
  bool get notifyBlendUpdates => _notifyBlendUpdates;

  bool _notifyTogetherInvites = true;
  bool get notifyTogetherInvites => _notifyTogetherInvites;

  bool _notifyProductNews = false;
  bool get notifyProductNews => _notifyProductNews;

  // ==================== PRIVACY & PERSONALIZATION ====================
  bool _personalizationEnabled = true;
  bool get personalizationEnabled => _personalizationEnabled;

  bool _listeningActivityOnProfile = true;
  bool get listeningActivityOnProfile => _listeningActivityOnProfile;

  bool _saveListeningHistory = true;
  bool get saveListeningHistory => _saveListeningHistory;

  bool _privateSession = false;
  bool get privateSession => _privateSession;

  // public | friends | private
  String _profileVisibility = 'public';
  String get profileVisibility => _profileVisibility;

  bool _showTopArtists = true;
  bool get showTopArtists => _showTopArtists;

  bool _shareAnonymousErrors = true;
  bool get shareAnonymousErrors => _shareAnonymousErrors;

  // ==================== DOWNLOADS & STORAGE ====================
  bool _downloadWifiOnly = true;
  bool get downloadWifiOnly => _downloadWifiOnly;

  double _maxCacheGb = 3.0; // 0.5 to 10 GB
  double get maxCacheGb => _maxCacheGb;

  // ==================== CONTENT & REGION ====================
  String _musicCountry = 'IN';
  String get musicCountry => _musicCountry;

  List<String> _preferredLanguages = ['ta', 'en', 'hi'];
  List<String> get preferredLanguages => List.unmodifiable(_preferredLanguages);

  // ==================== SOCIAL ====================
  // dj | collab
  String _defaultRoomMode = 'dj';
  String get defaultRoomMode => _defaultRoomMode;

  // everyone | friends
  String _whoCanInvite = 'everyone';
  String get whoCanInvite => _whoCanInvite;

  // Initialize from SharedPreferences and trigger background remote pull
  Future<void> initialize() async {
    if (_isInitialized) return;
    _prefs = await SharedPreferences.getInstance();

    // 1. Load local SharedPreferences immediately
    _wifiQuality = _prefs.getString('zen_wifi_quality') ?? 'lossless';
    _cellularQuality = _prefs.getString('zen_cellular_quality') ?? 'high';
    _downloadQuality = _prefs.getString('zen_download_quality') ?? 'lossless';
    _normalizeVolume = _prefs.getBool('zen_normalize_volume') ?? true;
    _explicitFilter = _prefs.getBool('zen_explicit_filter') ?? false;
    _monoAudio = _prefs.getBool('zen_mono_audio') ?? false;
    _gaplessPlayback = _prefs.getBool('zen_gapless_playback') ?? true;

    _crossfadeSeconds = _prefs.getInt('zen_crossfade_sec') ?? 0;
    _autoplaySimilar = _prefs.getBool('zen_autoplay_similar') ?? true;
    _autoHideDetails = _prefs.getBool('zen_auto_hide_details') ?? true;
    _pauseOnDisconnect = _prefs.getBool('zen_pause_on_disconnect') ?? true;
    _resumeWhereLeftOff = _prefs.getBool('zen_resume_where_left_off') ?? true;
    _lyricsDefaultScript = _prefs.getString('zen_lyrics_script') ?? 'original';
    _lyricsScale = _prefs.getDouble('zen_lyrics_scale') ?? 1.0;

    _accentColor = _prefs.getString('zen_accent_color') ?? 'crimson';
    _dynamicAlbumColors = _prefs.getBool('zen_dynamic_album_colors') ?? true;
    _fluidMeshBg = _prefs.getBool('zen_fluid_mesh_bg') ?? true;
    _reduceMotion = _prefs.getBool('zen_reduce_motion') ?? false;
    _themeMode = _prefs.getString('zen_theme_mode') ?? 'dark';
    _glassEffects = _prefs.getBool('zen_glass_effects') ?? true;
    _hapticsEnabled = _prefs.getBool('zen_haptics_enabled') ?? true;

    _emailNotifications = _prefs.getBool('zen_email_notif') ?? false;
    _weeklySummaryEmail = _prefs.getBool('zen_weekly_summary') ?? false;
    _newReleaseAlerts = _prefs.getBool('zen_new_releases') ?? true;
    _playlistUpdates = _prefs.getBool('zen_playlist_updates') ?? true;
    _notifyBlendUpdates = _prefs.getBool('zen_notify_blend') ?? true;
    _notifyTogetherInvites = _prefs.getBool('zen_notify_together') ?? true;
    _notifyProductNews = _prefs.getBool('zen_notify_product') ?? false;

    _personalizationEnabled = _prefs.getBool('zen_personalization') ?? true;
    _listeningActivityOnProfile = _prefs.getBool('zen_listening_activity') ?? true;
    _saveListeningHistory = _prefs.getBool('zen_save_history') ?? true;
    _privateSession = false; // Never persists private session across restarts
    _profileVisibility = _prefs.getString('zen_profile_visibility') ?? 'public';
    _showTopArtists = _prefs.getBool('zen_show_top_artists') ?? true;
    _shareAnonymousErrors = _prefs.getBool('zen_share_errors') ?? true;

    _downloadWifiOnly = _prefs.getBool('zen_download_wifi_only') ?? true;
    _maxCacheGb = _prefs.getDouble('zen_max_cache_gb') ?? 3.0;

    _musicCountry = _prefs.getString('zen_music_country') ?? 'IN';
    _preferredLanguages = _prefs.getStringList('zen_preferred_langs') ?? ['ta', 'en', 'hi'];

    _defaultRoomMode = _prefs.getString('zen_default_room_mode') ?? 'dj';
    _whoCanInvite = _prefs.getString('zen_who_can_invite') ?? 'everyone';

    final rawTimestamps = _prefs.getString('zen_sync_timestamps');
    if (rawTimestamps != null) {
      try {
        final decoded = jsonDecode(rawTimestamps) as Map<String, dynamic>;
        decoded.forEach((k, v) => _syncTimestamps[k] = v.toString());
      } catch (_) {}
    }

    _isInitialized = true;
    notifyListeners();

    // 2. Fetch server settings in background and reconcile
    unawaited(fetchServerSettings());
  }

  // Fetch settings from server and apply per-key timestamp conflict resolution
  Future<void> fetchServerSettings() async {
    final token = await AuthService.instance.getAccessToken();
    if (token == null) return;

    try {
      final res = await http.get(
        Uri.parse('${ApiService.baseUrl}/api/me/settings'),
        headers: {
          'Authorization': 'Bearer $token',
          'Accept': 'application/json',
        },
      ).timeout(const Duration(seconds: 8));

      if (res.statusCode == 200) {
        final json = jsonDecode(res.body) as Map<String, dynamic>;
        final s = json['settings'] as Map<String, dynamic>? ?? {};
        final serverTimestamps = json['syncTimestamps'] as Map<String, dynamic>? ?? {};

        bool changed = false;

        void applyIfNewer(String key, dynamic serverVal, Function() updater) {
          if (serverVal == null) return;
          final serverTimeStr = serverTimestamps[key]?.toString();
          final localTimeStr = _syncTimestamps[key];

          if (serverTimeStr != null && localTimeStr != null) {
            final serverTime = DateTime.tryParse(serverTimeStr)?.millisecondsSinceEpoch ?? 0;
            final localTime = DateTime.tryParse(localTimeStr)?.millisecondsSinceEpoch ?? 0;
            if (serverTime < localTime) return; // Local change is newer
          }

          updater();
          if (serverTimeStr != null) _syncTimestamps[key] = serverTimeStr;
          changed = true;
        }

        applyIfNewer('audioQuality', s['audioQuality'], () {
          _wifiQuality = s['audioQuality'] == 'lossless' ? 'lossless' : (s['audioQuality'] == 'low' ? 'low' : 'high');
          _prefs.setString('zen_wifi_quality', _wifiQuality);
        });

        applyIfNewer('cellularQuality', s['cellularQuality'], () {
          _cellularQuality = s['cellularQuality']?.toString() ?? 'high';
          _prefs.setString('zen_cellular_quality', _cellularQuality);
        });

        applyIfNewer('downloadQuality', s['downloadQuality'], () {
          _downloadQuality = s['downloadQuality']?.toString() ?? 'lossless';
          _prefs.setString('zen_download_quality', _downloadQuality);
        });

        applyIfNewer('normalizeVolume', s['normalizeVolume'], () {
          _normalizeVolume = s['normalizeVolume'] == true;
          _prefs.setBool('zen_normalize_volume', _normalizeVolume);
        });

        applyIfNewer('explicitFilter', s['explicitFilter'], () {
          _explicitFilter = s['explicitFilter'] == true;
          _prefs.setBool('zen_explicit_filter', _explicitFilter);
        });

        applyIfNewer('gaplessPlayback', s['gaplessPlayback'], () {
          _gaplessPlayback = s['gaplessPlayback'] != false;
          _prefs.setBool('zen_gapless_playback', _gaplessPlayback);
        });

        applyIfNewer('autoplay', s['autoplay'], () {
          _autoplaySimilar = s['autoplay'] != false;
          _prefs.setBool('zen_autoplay_similar', _autoplaySimilar);
        });

        applyIfNewer('autoHideDetails', s['autoHideDetails'], () {
          _autoHideDetails = s['autoHideDetails'] != false;
          _prefs.setBool('zen_auto_hide_details', _autoHideDetails);
        });

        applyIfNewer('lyricsDefaultScript', s['lyricsDefaultScript'], () {
          _lyricsDefaultScript = s['lyricsDefaultScript']?.toString() ?? 'original';
          _prefs.setString('zen_lyrics_script', _lyricsDefaultScript);
        });

        applyIfNewer('saveListeningHistory', s['saveListeningHistory'], () {
          _saveListeningHistory = s['saveListeningHistory'] != false;
          _prefs.setBool('zen_save_history', _saveListeningHistory);
        });

        applyIfNewer('listeningActivity', s['listeningActivity'], () {
          _listeningActivityOnProfile = s['listeningActivity'] != false;
          _prefs.setBool('zen_listening_activity', _listeningActivityOnProfile);
        });

        applyIfNewer('profileVisibility', s['profileVisibility'], () {
          _profileVisibility = s['profileVisibility']?.toString() ?? 'public';
          _prefs.setString('zen_profile_visibility', _profileVisibility);
        });

        applyIfNewer('showTopArtists', s['showTopArtists'], () {
          _showTopArtists = s['showTopArtists'] != false;
          _prefs.setBool('zen_show_top_artists', _showTopArtists);
        });

        applyIfNewer('defaultRoomMode', s['defaultRoomMode'], () {
          _defaultRoomMode = s['defaultRoomMode']?.toString() ?? 'dj';
          _prefs.setString('zen_default_room_mode', _defaultRoomMode);
        });

        applyIfNewer('whoCanInvite', s['whoCanInvite'], () {
          _whoCanInvite = s['whoCanInvite']?.toString() ?? 'everyone';
          _prefs.setString('zen_who_can_invite', _whoCanInvite);
        });

        applyIfNewer('selectedCountryCode', s['selectedCountryCode'], () {
          _musicCountry = s['selectedCountryCode']?.toString() ?? 'IN';
          _prefs.setString('zen_music_country', _musicCountry);
        });

        if (s['languages'] is List) {
          applyIfNewer('languages', s['languages'], () {
            _preferredLanguages = List<String>.from(s['languages']);
            _prefs.setStringList('zen_preferred_langs', _preferredLanguages);
          });
        }

        if (changed) {
          _prefs.setString('zen_sync_timestamps', jsonEncode(_syncTimestamps));
          notifyListeners();
        }
      }
    } catch (_) {}
  }

  // ==================== SETTERS WITH OPTIMISTIC SYNC ====================

  void setWifiQuality(String q) {
    if (_wifiQuality == q) return;
    _wifiQuality = q;
    _prefs.setString('zen_wifi_quality', q);
    _recordChange('audioQuality', q);
    notifyListeners();
  }

  void setCellularQuality(String q) {
    if (_cellularQuality == q) return;
    _cellularQuality = q;
    _prefs.setString('zen_cellular_quality', q);
    _recordChange('cellularQuality', q);
    notifyListeners();
  }

  void setDownloadQuality(String q) {
    if (_downloadQuality == q) return;
    _downloadQuality = q;
    _prefs.setString('zen_download_quality', q);
    _recordChange('downloadQuality', q);
    notifyListeners();
  }

  void setNormalizeVolume(bool val) {
    if (_normalizeVolume == val) return;
    _normalizeVolume = val;
    _prefs.setBool('zen_normalize_volume', val);
    _recordChange('normalizeVolume', val);
    notifyListeners();
  }

  void setExplicitFilter(bool val) {
    if (_explicitFilter == val) return;
    _explicitFilter = val;
    _prefs.setBool('zen_explicit_filter', val);
    _recordChange('explicitFilter', val);
    notifyListeners();
  }

  void setMonoAudio(bool val) {
    if (_monoAudio == val) return;
    _monoAudio = val;
    _prefs.setBool('zen_mono_audio', val);
    notifyListeners();
  }

  void setGaplessPlayback(bool val) {
    if (_gaplessPlayback == val) return;
    _gaplessPlayback = val;
    _prefs.setBool('zen_gapless_playback', val);
    _recordChange('gaplessPlayback', val);
    notifyListeners();
  }

  void setCrossfadeSeconds(int sec) {
    if (_crossfadeSeconds == sec) return;
    _crossfadeSeconds = sec;
    _prefs.setInt('zen_crossfade_sec', sec);
    _recordChange('crossfade', sec > 0);
    notifyListeners();
  }

  void setAutoplaySimilar(bool val) {
    if (_autoplaySimilar == val) return;
    _autoplaySimilar = val;
    _prefs.setBool('zen_autoplay_similar', val);
    _recordChange('autoplay', val);
    notifyListeners();
  }

  void setAutoHideDetails(bool val) {
    if (_autoHideDetails == val) return;
    _autoHideDetails = val;
    _prefs.setBool('zen_auto_hide_details', val);
    _recordChange('autoHideDetails', val);
    notifyListeners();
  }

  void setSleepTimer(int minutes) {
    _sleepTimerMinutes = minutes;
    notifyListeners();
  }

  void setPauseOnDisconnect(bool val) {
    if (_pauseOnDisconnect == val) return;
    _pauseOnDisconnect = val;
    _prefs.setBool('zen_pause_on_disconnect', val);
    notifyListeners();
  }

  void setResumeWhereLeftOff(bool val) {
    if (_resumeWhereLeftOff == val) return;
    _resumeWhereLeftOff = val;
    _prefs.setBool('zen_resume_where_left_off', val);
    notifyListeners();
  }

  void setLyricsDefaultScript(String s) {
    if (_lyricsDefaultScript == s) return;
    _lyricsDefaultScript = s;
    _prefs.setString('zen_lyrics_script', s);
    _recordChange('lyricsDefaultScript', s);
    notifyListeners();
  }

  void setLyricsScale(double scale) {
    if (_lyricsScale == scale) return;
    _lyricsScale = scale;
    _prefs.setDouble('zen_lyrics_scale', scale);
    notifyListeners();
  }

  void setAccentColor(String color) {
    if (_accentColor == color) return;
    _accentColor = color;
    _prefs.setString('zen_accent_color', color);
    _recordChange('accentColor', color);
    notifyListeners();
  }

  void setDynamicAlbumColors(bool val) {
    if (_dynamicAlbumColors == val) return;
    _dynamicAlbumColors = val;
    _prefs.setBool('zen_dynamic_album_colors', val);
    notifyListeners();
  }

  void setFluidMeshBg(bool val) {
    if (_fluidMeshBg == val) return;
    _fluidMeshBg = val;
    _prefs.setBool('zen_fluid_mesh_bg', val);
    notifyListeners();
  }

  void setReduceMotion(bool val) {
    if (_reduceMotion == val) return;
    _reduceMotion = val;
    _prefs.setBool('zen_reduce_motion', val);
    notifyListeners();
  }

  void setThemeMode(String mode) {
    if (_themeMode == mode) return;
    _themeMode = mode;
    _prefs.setString('zen_theme_mode', mode);
    notifyListeners();
  }

  void setGlassEffects(bool val) {
    if (_glassEffects == val) return;
    _glassEffects = val;
    _prefs.setBool('zen_glass_effects', val);
    notifyListeners();
  }

  void setHapticsEnabled(bool val) {
    if (_hapticsEnabled == val) return;
    _hapticsEnabled = val;
    _prefs.setBool('zen_haptics_enabled', val);
    notifyListeners();
  }

  void setEmailNotifications(bool val) {
    if (_emailNotifications == val) return;
    _emailNotifications = val;
    _prefs.setBool('zen_email_notif', val);
    _recordChange('emailNotifications', val);
    notifyListeners();
  }

  void setWeeklySummaryEmail(bool val) {
    if (_weeklySummaryEmail == val) return;
    _weeklySummaryEmail = val;
    _prefs.setBool('zen_weekly_summary', val);
    _recordChange('weeklySummaryEmail', val);
    notifyListeners();
  }

  void setNewReleaseAlerts(bool val) {
    if (_newReleaseAlerts == val) return;
    _newReleaseAlerts = val;
    _prefs.setBool('zen_new_releases', val);
    _recordChange('newReleaseAlerts', val);
    notifyListeners();
  }

  void setPlaylistUpdates(bool val) {
    if (_playlistUpdates == val) return;
    _playlistUpdates = val;
    _prefs.setBool('zen_playlist_updates', val);
    _recordChange('playlistUpdates', val);
    notifyListeners();
  }

  void setNotifyBlendUpdates(bool val) {
    if (_notifyBlendUpdates == val) return;
    _notifyBlendUpdates = val;
    _prefs.setBool('zen_notify_blend', val);
    _recordChange('notifyBlendUpdates', val);
    notifyListeners();
  }

  void setNotifyTogetherInvites(bool val) {
    if (_notifyTogetherInvites == val) return;
    _notifyTogetherInvites = val;
    _prefs.setBool('zen_notify_together', val);
    _recordChange('notifyTogetherInvites', val);
    notifyListeners();
  }

  void setNotifyProductNews(bool val) {
    if (_notifyProductNews == val) return;
    _notifyProductNews = val;
    _prefs.setBool('zen_notify_product', val);
    _recordChange('notifyProductNews', val);
    notifyListeners();
  }

  void setPersonalizationEnabled(bool val) {
    if (_personalizationEnabled == val) return;
    _personalizationEnabled = val;
    _prefs.setBool('zen_personalization', val);
    _recordChange('personalizationEnabled', val);
    notifyListeners();
  }

  void setListeningActivityOnProfile(bool val) {
    if (_listeningActivityOnProfile == val) return;
    _listeningActivityOnProfile = val;
    _prefs.setBool('zen_listening_activity', val);
    _recordChange('listeningActivity', val);
    notifyListeners();
  }

  void setSaveListeningHistory(bool val) {
    if (_saveListeningHistory == val) return;
    _saveListeningHistory = val;
    _prefs.setBool('zen_save_history', val);
    _recordChange('saveListeningHistory', val);
    notifyListeners();
  }

  void setPrivateSession(bool val) {
    if (_privateSession == val) return;
    _privateSession = val;
    notifyListeners();
  }

  void setProfileVisibility(String v) {
    if (_profileVisibility == v) return;
    _profileVisibility = v;
    _prefs.setString('zen_profile_visibility', v);
    _recordChange('profileVisibility', v);
    notifyListeners();
  }

  void setShowTopArtists(bool val) {
    if (_showTopArtists == val) return;
    _showTopArtists = val;
    _prefs.setBool('zen_show_top_artists', val);
    _recordChange('showTopArtists', val);
    notifyListeners();
  }

  void setShareAnonymousErrors(bool val) {
    if (_shareAnonymousErrors == val) return;
    _shareAnonymousErrors = val;
    _prefs.setBool('zen_share_errors', val);
    notifyListeners();
  }

  void setDownloadWifiOnly(bool val) {
    if (_downloadWifiOnly == val) return;
    _downloadWifiOnly = val;
    _prefs.setBool('zen_download_wifi_only', val);
    notifyListeners();
  }

  void setMaxCacheGb(double val) {
    if (_maxCacheGb == val) return;
    _maxCacheGb = val;
    _prefs.setDouble('zen_max_cache_gb', val);
    notifyListeners();
  }

  void setMusicCountry(String code) {
    if (_musicCountry == code) return;
    _musicCountry = code;
    _prefs.setString('zen_music_country', code);
    _recordChange('selectedCountryCode', code);
    notifyListeners();
  }

  void setPreferredLanguages(List<String> langs) {
    _preferredLanguages = List.from(langs);
    _prefs.setStringList('zen_preferred_langs', _preferredLanguages);
    _recordChange('languages', _preferredLanguages);
    notifyListeners();
  }

  void setDefaultRoomMode(String mode) {
    if (_defaultRoomMode == mode) return;
    _defaultRoomMode = mode;
    _prefs.setString('zen_default_room_mode', mode);
    _recordChange('defaultRoomMode', mode);
    notifyListeners();
  }

  void setWhoCanInvite(String who) {
    if (_whoCanInvite == who) return;
    _whoCanInvite = who;
    _prefs.setString('zen_who_can_invite', who);
    _recordChange('whoCanInvite', who);
    notifyListeners();
  }

  // ==================== SYNC ENGINE ====================
  final Map<String, dynamic> _pendingSync = {};

  void _recordChange(String key, dynamic val) {
    final nowIso = DateTime.now().toUtc().toIso8601String();
    _syncTimestamps[key] = nowIso;
    _pendingSync[key] = val;
    _prefs.setString('zen_sync_timestamps', jsonEncode(_syncTimestamps));

    // Debounce batch upload (800ms)
    _debounceTimer?.cancel();
    _debounceTimer = Timer(const Duration(milliseconds: 800), _pushPendingSync);
  }

  Future<void> _pushPendingSync() async {
    if (_pendingSync.isEmpty) return;

    final token = await AuthService.instance.getAccessToken();
    if (token == null) return;

    final payload = Map<String, dynamic>.from(_pendingSync);
    final timestamps = Map<String, String>.from(_syncTimestamps);
    _pendingSync.clear();

    try {
      await http.put(
        Uri.parse('${ApiService.baseUrl}/api/me/settings'),
        headers: {
          'Authorization': 'Bearer $token',
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'settings': payload,
          'timestamps': timestamps,
        }),
      ).timeout(const Duration(seconds: 10));
    } catch (_) {
      // Re-queue failed items for next sync attempt
      payload.forEach((k, v) => _pendingSync[k] = v);
    }
  }

  // Clear all listening history on backend
  Future<bool> clearListeningHistory() async {
    final token = await AuthService.instance.getAccessToken();
    if (token == null) return false;

    try {
      final res = await http.delete(
        Uri.parse('${ApiService.baseUrl}/api/activity/history'),
        headers: {'Authorization': 'Bearer $token'},
      ).timeout(const Duration(seconds: 10));

      return res.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
