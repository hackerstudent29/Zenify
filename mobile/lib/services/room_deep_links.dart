import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';

class RoomLink {
  const RoomLink(this.code, this.token);
  final String code;
  final String? token; // invitation token (cryptographically random, server-validated)
  @override
  String toString() => 'RoomLink($code, ${token == null ? 'no-token' : 'token'})';
}

/// Parses `zenify://room/7K9ABC`, `zenify://room/7K9ABC?t=TOKEN`,
/// `https://zenify.app/room/7K9ABC?t=TOKEN` (Android App Link). Returns null if not a room link.
/// Hosts are configurable so staging/prod can differ.
RoomLink? parseRoomLink(
  Uri uri, {
  Set<String> httpsHosts = const {'zenify.app', 'www.zenify.app', 'listenzenify.com', 'www.listenzenify.com'},
}) {
  final isCustom = uri.scheme == 'zenify' && uri.host == 'room';
  final isHttps = uri.scheme == 'https' && httpsHosts.contains(uri.host);
  if (!isCustom && !isHttps) return null;
  final segs = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  String? code;
  if (isCustom && segs.isNotEmpty) code = segs.first;
  if (isHttps && segs.length >= 2 && segs.first == 'room') code = segs[1];
  if (code == null) return null;
  code = code.toUpperCase();
  if (!RegExp(r'^[0-9A-HJKMNP-TV-Z]{6}$').hasMatch(code)) return null; // Crockford Base32, 6 chars (no I L O U)
  final t = uri.queryParameters['t'] ?? uri.queryParameters['invite'];
  return RoomLink(code, (t == null || t.isEmpty || t.length > 128) ? null : t);
}

/// Listen once at app level. The Room screen consumes [pending] and calls [consume].
class RoomDeepLinks extends ChangeNotifier {
  RoomDeepLinks._();
  static final RoomDeepLinks instance = RoomDeepLinks._();

  StreamSubscription<Uri>? _sub;
  RoomLink? pending;

  Future<void> start() async {
    if (_sub != null) return;
    final links = AppLinks();
    try {
      final initial = await links.getInitialLink();
      if (initial != null) _handle(initial);
    } catch (_) {}
    _sub = links.uriLinkStream.listen(_handle, onError: (_) {});
  }

  void _handle(Uri uri) {
    final l = parseRoomLink(uri);
    if (l == null) return;
    pending = l;
    notifyListeners();
  }

  RoomLink? consume() {
    final p = pending;
    pending = null;
    return p;
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
