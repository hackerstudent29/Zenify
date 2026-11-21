import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile/atlas/core/spring.dart';
import 'package:mobile/atlas/data/atlas_repository.dart';
import 'package:mobile/atlas/globe/globe_controller.dart';
import 'package:mobile/atlas/models/atlas_models.dart';
import 'package:mobile/atlas/services/passport_store.dart';

const _chennai = AtlasCity(
  id: 'chennai',
  name: 'Chennai',
  country: 'India',
  iso: 'IN',
  region: 'Tamil Nadu',
  lat: 13.08,
  lng: 80.27,
  tier: 1,
  genres: ['Film music', 'Carnatic'],
  artists: ['A. R. Rahman', 'Anirudh Ravichander'],
);

final _india = AtlasCountry(
  id: 'in',
  name: 'India',
  iso: 'IN',
  continent: 'Asia',
  lat: 20.59,
  lng: 78.96,
  minLat: 8.0,
  minLng: 68.0,
  maxLat: 37.0,
  maxLng: 97.0,
  hasCharts: true,
  rings: [
    Float32List.fromList([
      8.0, 77.0,
      15.0, 73.0,
      24.0, 68.0,
      35.0, 75.0,
      28.0, 96.0,
      13.0, 81.0,
      8.0, 77.0,
    ]),
  ],
);

void main() {
  testWidgets('city at the camera centre projects to the screen centre',
      (tester) async {
    final c = GlobeController(
      vsync: const TestVSync(),
      cities: const [_chennai],
      countries: [_india],
      lat: 13.08,
      lng: 80.27,
    );
    c.viewport = const Size(400, 800);
    final p = c.projectCity(_chennai)!;
    expect((p - c.center).distance, lessThan(0.01));
    expect(c.project(13.08, 80.27 + 180), isNull); // far side is hidden
    c.dispose();
  });

  testWidgets('flyTo takes the short way around the date line', (tester) async {
    final c = GlobeController(
      vsync: const TestVSync(),
      cities: const [_chennai],
      countries: [_india],
      lat: 0,
      lng: 170,
    );
    const far = AtlasCity(
      id: 'x',
      name: 'X',
      country: 'Y',
      iso: 'FJ',
      region: '',
      lat: 0,
      lng: -170,
      tier: 2,
      genres: [],
      artists: [],
    );
    c.flyTo(far);
    expect(c.lngTarget, closeTo(190, 0.001)); // +20, not -340
    c.dispose();
  });

  test('flag emoji comes from the ISO code', () {
    expect(_chennai.flag, '\u{1F1EE}\u{1F1F3}');
    expect(_india.flag, '\u{1F1EE}\u{1F1F3}');
  });

  testWidgets('inverse unprojection correctly recovers center coordinates',
      (tester) async {
    final c = GlobeController(
      vsync: const TestVSync(),
      cities: const [_chennai],
      countries: [_india],
      lat: 20.0,
      lng: 78.0,
    );
    c.viewport = const Size(400, 800);
    final coords = c.unproject(c.center);
    expect(coords, isNotNull);
    expect(coords!.lat, closeTo(20.0, 0.01));
    expect(coords.lng, closeTo(78.0, 0.01));

    // Outside the globe radius returns null
    final outside = c.unproject(const Offset(0, 0));
    expect(outside, isNull);
    c.dispose();
  });

  test('country point-in-polygon containment works accurately', () {
    // Center of India (20.59, 78.96) is inside the polygon
    expect(_india.contains(20.59, 78.96), isTrue);
    // Chennai (13.08, 80.27) is inside
    expect(_india.contains(13.08, 80.27), isTrue);
    // London (51.5, -0.12) is outside
    expect(_india.contains(51.5, -0.12), isFalse);
    // Outside bounding box
    expect(_india.contains(0.0, 0.0), isFalse);
  });

  test('search finds countries, cities, and artists', () {
    final d = AtlasData([_india], const [_chennai]);
    expect(d.search('chen').first.city?.id, 'chennai');
    expect(d.search('india').first.country?.iso, 'IN');
    final a = d.search('rahman').first;
    expect(a.artist, 'A. R. Rahman');
    expect(d.search('zzzzzz'), isEmpty);
  });

  test('musical journeys and battles are initialized', () {
    final d = AtlasData([_india], const [_chennai]);
    expect(d.journeys, isNotEmpty);
    expect(d.journeys.any((j) => j.id == 'sounds-of-asia'), isTrue);
    expect(d.journeys.any((j) => j.id == 'tamil-musical-journey'), isTrue);
  });

  test('spring settles on its target', () {
    final s = Spring1D(0)..target = 1;
    for (var i = 0; i < 120; i++) {
      s.step(1 / 60);
    }
    expect(s.value, closeTo(1, 0.01));
  });

  test('stamps are idempotent and persisted in Sound Passport', () async {
    SharedPreferences.setMockInitialValues({});
    final store = PassportStore.instance;
    await store.clear();
    expect(await store.stamp('chennai'), isTrue);
    expect(await store.stamp('chennai'), isFalse);
    expect(store.count, 1);
    expect(store.isStamped('chennai'), isTrue);
    expect(await store.stamp('country_IN'), isTrue);
    expect(store.count, 2);
  });
}
