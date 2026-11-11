import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart' as rtc;
import 'package:livekit_client/livekit_client.dart' as lk;
import 'package:permission_handler/permission_handler.dart';

/// Voice is a separate LiveKit (WebRTC) connection. It never touches the music WebSocket.
/// Singleton so voice survives leaving the Room screen (room stays alive on server).
///
/// VERIFY against your installed livekit_client / flutter_webrtc versions:
///  - `AndroidAudioConfiguration.media` init key
///  - `RemoteAudioTrack.setVolume`
/// Needs external infra: LiveKit server + API key/secret (backend only). See BACKEND_AGENT_SPEC.md §8.
class VoiceController extends ChangeNotifier {
  VoiceController._();
  static final VoiceController instance = VoiceController._();

  lk.Room? _room;
  lk.EventsListener<lk.RoomEvent>? _events;

  bool connecting = false;
  bool connected = false;
  bool micOn = false;
  bool canPublish = false;
  String? error;
  Set<String> speaking = {};
  final Map<String, double> volumes = {};

  static bool _audioConfigured = false;

  /// Media-style audio attributes so just_audio / music keeps playing and only ducks.
  static Future<void> _configureAndroidAudio() async {
    if (_audioConfigured || !Platform.isAndroid) return;
    await rtc.WebRTC.initialize(options: {'androidAudioConfiguration': rtc.AndroidAudioConfiguration.media.toMap()});
    _audioConfigured = true;
  }

  Future<bool> join({required String url, required String token}) async {
    if (connecting || connected) return connected;
    connecting = true;
    error = null;
    notifyListeners();
    try {
      await _configureAndroidAudio();
      final room = lk.Room(
        roomOptions: const lk.RoomOptions(
          adaptiveStream: true,
          dynacast: true,
          defaultAudioCaptureOptions: lk.AudioCaptureOptions(echoCancellation: true, noiseSuppression: true, autoGainControl: true),
        ),
      );
      _events = room.createListener()..listen(_onEvent);
      await room.connect(url, token);
      _room = room;
      connected = true;
      _sync();
    } catch (e) {
      error = 'Could not join voice: $e';
      await leave();
    } finally {
      connecting = false;
      notifyListeners();
    }
    return connected;
  }

  void _onEvent(lk.RoomEvent e) => _sync();

  void _sync() {
    final r = _room;
    if (r == null) return;
    speaking = r.activeSpeakers.map((p) => p.identity).toSet();
    final lp = r.localParticipant;
    micOn = lp?.isMicrophoneEnabled() ?? false;
    canPublish = lp?.permissions.canPublish ?? false; // host can revoke server-side
    notifyListeners();
  }

  Future<void> setMic(bool on) async {
    final lp = _room?.localParticipant;
    if (lp == null) return;
    if (on) {
      final st = await Permission.microphone.request();
      if (!st.isGranted) {
        error = st.isPermanentlyDenied ? 'Microphone is blocked. Enable it in system settings.' : 'Microphone permission is needed to speak.';
        notifyListeners();
        return;
      }
    }
    try {
      await lp.setMicrophoneEnabled(on);
    } catch (e) {
      error = 'Microphone unavailable: $e';
    }
    _sync();
  }

  Future<void> setParticipantVolume(String identity, double v) async {
    volumes[identity] = v;
    final p = _room?.remoteParticipants[identity];
    if (p != null) {
      for (final pub in p.audioTrackPublications) {
        final t = pub.track;
        if (t is lk.RemoteAudioTrack) {
          await rtc.Helper.setVolume(v, t.mediaStreamTrack);
        }
      }
    }
    notifyListeners();
  }

  Future<void> leave() async {
    try {
      await _events?.dispose();
      await _room?.disconnect();
      await _room?.dispose();
    } catch (_) {}
    _events = null;
    _room = null;
    connected = false;
    micOn = false;
    speaking = {};
    notifyListeners();
  }
}
