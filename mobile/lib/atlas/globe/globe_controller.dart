import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

import '../core/haptics.dart';
import '../core/spring.dart';
import '../models/atlas_models.dart';

/// Camera state (center lat/lng + zoom), spring physics, inertia,
/// auto-rotation, marker projection and hit-testing for countries & cities.
class GlobeController extends ChangeNotifier {
  GlobeController({
    required TickerProvider vsync,
    required this.cities,
    this.countries = const [],
    double lat = 18,
    double lng = 78,
  }) : _lat = Spring1D(lat),
       _lng = Spring1D(lng) {
    _ticker = vsync.createTicker(_onTick);
    _clock.start();
    _poke();
  }

  static const double minZoom = 0.85;
  static const double maxZoom = 2.8;
  static const double _hitRadius = 26;

  final List<AtlasCity> cities;
  final List<AtlasCountry> countries;
  final Spring1D _lat;
  final Spring1D _lng;
  final Spring1D _zoom = Spring1D(1.0);
  final Stopwatch _clock = Stopwatch();

  late final Ticker _ticker;
  Duration _last = Duration.zero;
  Size viewport = Size.zero;

  AtlasCity? _selectedCity;
  AtlasCountry? _selectedCountry;

  bool _touching = false;
  bool _inertia = false;
  double _vLat = 0, _vLng = 0; // deg/s
  double _lastInteraction = 0; // seconds on _clock
  Completer<void>? _flight;
  bool autoRotate = true;
  bool _atZoomLimit = false;

  double get lat => _lat.value;
  @visibleForTesting
  double get lngTarget => _lng.target;
  double get lng => _lng.value;
  double get zoom => _zoom.value;
  double get time => _clock.elapsedMicroseconds / 1e6;

  AtlasCity? get selected => _selectedCity;
  AtlasCity? get selectedCity => _selectedCity;
  AtlasCountry? get selectedCountry => _selectedCountry;

  Offset get center => Offset(viewport.width / 2, viewport.height * 0.47);
  double get radius => viewport.width * 0.42 * _zoom.value;

  // ───────── projection ─────────

  /// Orthographic projection. Null when the point is on the far side.
  Offset? project(double latDeg, double lngDeg) {
    const d2r = math.pi / 180;
    final lat0 = _lat.value * d2r, lng0 = _lng.value * d2r;
    final la = latDeg * d2r, dl = lngDeg * d2r - lng0;
    final cosc =
        math.sin(lat0) * math.sin(la) +
        math.cos(lat0) * math.cos(la) * math.cos(dl);
    if (cosc <= 0.05) return null;
    final r = radius;
    final x = r * math.cos(la) * math.sin(dl);
    final y =
        r *
        (math.cos(lat0) * math.sin(la) -
            math.sin(lat0) * math.cos(la) * math.cos(dl));
    return Offset(center.dx + x, center.dy - y);
  }

  Offset? projectCity(AtlasCity c) => project(c.lat, c.lng);
  Offset? projectCountry(AtlasCountry c) => project(c.lat, c.lng);

  /// Inverse orthographic projection from screen pixel to (lat, lng).
  /// Returns null if screen point falls outside the globe circle.
  ({double lat, double lng})? unproject(Offset p) {
    final r = radius;
    if (r <= 0) return null;
    final dx = (p.dx - center.dx) / r;
    final dy = -(p.dy - center.dy) / r;
    final rho = math.sqrt(dx * dx + dy * dy);
    if (rho > 1.0) return null;

    const d2r = math.pi / 180;
    const r2d = 180 / math.pi;
    final lat0 = _lat.value * d2r;
    final lng0 = _lng.value * d2r;

    if (rho == 0) {
      return (lat: _lat.value, lng: _lng.value);
    }

    final c = math.asin(rho);
    final sinC = math.sin(c);
    final cosC = math.cos(c);

    final latRad = math.asin(
      cosC * math.sin(lat0) + (dy * sinC * math.cos(lat0)) / rho,
    );
    final dlng = math.atan2(
      dx * sinC,
      rho * math.cos(lat0) * cosC - dy * math.sin(lat0) * sinC,
    );
    final lngDeg = (lng0 + dlng) * r2d;
    final normLng = (lngDeg + 540) % 360 - 180;

    return (lat: latRad * r2d, lng: normLng);
  }

  /// Hit test: checks city markers first (high precision),
  /// then unprojects to check country boundaries.
  ({AtlasCity? city, AtlasCountry? country}) hitTestAll(Offset p) {
    // 1. Check city markers
    AtlasCity? bestCity;
    var bestD = _hitRadius;
    for (final c in cities) {
      final o = projectCity(c);
      if (o == null) continue;
      final d = (o - p).distance;
      if (d < bestD) {
        bestD = d;
        bestCity = c;
      }
    }
    if (bestCity != null) {
      return (city: bestCity, country: null);
    }

    // 2. Unproject point to find country
    final coords = unproject(p);
    if (coords != null) {
      for (final country in countries) {
        if (country.contains(coords.lat, coords.lng)) {
          return (city: null, country: country);
        }
      }
    }

    return (city: null, country: null);
  }

  /// Legacy hitTest for city markers.
  AtlasCity? hitTest(Offset p) => hitTestAll(p).city;

  // ───────── selection ─────────

  void select(AtlasCity? c) {
    selectCity(c);
  }

  void selectCity(AtlasCity? c) {
    if (_selectedCity == c && _selectedCountry == null) return;
    _selectedCity = c;
    _selectedCountry = null;
    _poke();
    notifyListeners();
  }

  void selectCountry(AtlasCountry? c) {
    if (_selectedCountry == c && _selectedCity == null) return;
    _selectedCountry = c;
    _selectedCity = null;
    _poke();
    notifyListeners();
  }

  void clearSelection() {
    if (_selectedCity == null && _selectedCountry == null) return;
    _selectedCity = null;
    _selectedCountry = null;
    _poke();
    notifyListeners();
  }

  // ───────── gestures ─────────

  void touchStart() {
    _touching = true;
    _inertia = false;
    _lastInteraction = time;
    _cancelFlight();
    for (final s in [_lat, _lng, _zoom]) {
      s.snapTo(s.value);
    }
    _poke();
  }

  void dragBy(Offset delta) {
    final k = 180 / math.pi / radius;
    _lng.snapTo(_lng.value - delta.dx * k);
    _lat.snapTo((_lat.value + delta.dy * k).clamp(-70.0, 70.0).toDouble());
    _vLng = 0;
    _vLat = 0;
    notifyListeners();
  }

  void pinchTo(double z) {
    final c = z.clamp(minZoom, maxZoom).toDouble();
    final limit = c != z;
    if (limit && !_atZoomLimit) H.select();
    _atZoomLimit = limit;
    _zoom.snapTo(c);
    notifyListeners();
  }

  void touchEnd(Offset velocityPxPerSec) {
    _touching = false;
    _atZoomLimit = false;
    _lastInteraction = time;
    final k = 180 / math.pi / radius;
    _vLng = -velocityPxPerSec.dx * k;
    _vLat = velocityPxPerSec.dy * k;
    _inertia = math.sqrt(_vLng * _vLng + _vLat * _vLat) > 10;
    _poke();
  }

  /// Camera flyTo for a City.
  Future<void> flyTo(AtlasCity c, {double zoom = 1.3}) =>
      flyToCoordinates(c.lat, c.lng, zoom: zoom);

  Future<void> flyToCity(AtlasCity c, {double zoom = 1.4}) =>
      flyToCoordinates(c.lat, c.lng, zoom: zoom);

  Future<void> flyToCountry(AtlasCountry c, {double zoom = 1.25}) =>
      flyToCoordinates(c.lat, c.lng, zoom: zoom);

  Future<void> flyToCoordinates(
    double targetLat,
    double targetLng, {
    double zoom = 1.3,
  }) {
    _cancelFlight();
    _inertia = false;
    _lastInteraction = time;
    var d = (targetLng - _lng.value) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    _lng.target = _lng.value + d;
    _lat.target = targetLat.clamp(-65.0, 65.0).toDouble();
    _zoom.target = zoom.clamp(minZoom, maxZoom).toDouble();
    final done = Completer<void>();
    _flight = done;
    _poke();
    return done.future;
  }

  /// Reset camera to default home view.
  Future<void> resetCamera() {
    clearSelection();
    return flyToCoordinates(18.0, 78.0, zoom: 1.0);
  }

  void zoomIn() {
    pinchTo(_zoom.target + 0.35);
  }

  void zoomOut() {
    pinchTo(_zoom.target - 0.35);
  }

  void doubleTapZoom(Offset p) {
    final coords = unproject(p);
    if (coords != null) {
      final nextZoom = _zoom.value < 1.4 ? 1.7 : 1.0;
      flyToCoordinates(coords.lat, coords.lng, zoom: nextZoom);
    }
  }

  void _cancelFlight() {
    final f = _flight;
    _flight = null;
    if (f != null && !f.isCompleted) f.complete();
  }

  // ───────── loop ─────────

  bool get _springsSettled => _lat.settled && _lng.settled && _zoom.settled;

  bool get _needsTicker =>
      _touching ||
      _inertia ||
      !_springsSettled ||
      _flight != null ||
      _selectedCity != null ||
      _selectedCountry != null ||
      autoRotate;

  void _poke() {
    if (!_ticker.isActive && _needsTicker) {
      _last = Duration.zero;
      _ticker.start();
    }
  }

  void _onTick(Duration elapsed) {
    if (_last == Duration.zero) {
      _last = elapsed;
      return;
    }
    final dt = (elapsed - _last).inMicroseconds / 1e6;
    _last = elapsed;
    if (dt <= 0 || dt > 0.1) return;

    if (_inertia && !_touching) {
      final decay = math.exp(-4.2 * dt);
      _lng.snapTo(_lng.value + _vLng * dt);
      _lat.snapTo((_lat.value + _vLat * dt).clamp(-70.0, 70.0).toDouble());
      _vLng *= decay;
      _vLat *= decay;
      if (math.sqrt(_vLng * _vLng + _vLat * _vLat) < 1.2) {
        _inertia = false;
        _vLng = 0;
        _vLat = 0;
      }
    }

    if (autoRotate &&
        !_touching &&
        !_inertia &&
        _selectedCity == null &&
        _selectedCountry == null &&
        _flight == null &&
        time - _lastInteraction > 3.0) {
      _lng.snapTo(_lng.value + 3.8 * dt);
    }

    _lat.step(dt);
    _lng.step(dt);
    _zoom.step(dt);

    if (_flight != null && _springsSettled) {
      final f = _flight;
      _flight = null;
      if (f != null && !f.isCompleted) f.complete();
    }

    notifyListeners();

    if (!_needsTicker) {
      _ticker.stop();
      _last = Duration.zero;
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }
}
