import 'dart:convert';
import 'package:flutter/services.dart' show rootBundle;

import '../models/atlas_models.dart';

class AtlasData {
  AtlasData(this.countries, this.cities) {
    for (final c in countries) {
      _countriesByIso[c.iso] = c;
    }
    for (final c in cities) {
      _citiesById[c.id] = c;
      _citiesByCountry.putIfAbsent(c.iso, () => []).add(c);
      for (final a in c.artists) {
        _artistCity.putIfAbsent(a.toLowerCase(), () => c);
      }
    }
    _journeys = _buildJourneys();
    _battles = _buildBattles();
  }

  final List<AtlasCountry> countries;
  final List<AtlasCity> cities;
  late final List<AtlasJourney> _journeys;
  late final List<AtlasBattle> _battles;

  final Map<String, AtlasCountry> _countriesByIso = {};
  final Map<String, AtlasCity> _citiesById = {};
  final Map<String, List<AtlasCity>> _citiesByCountry = {};
  final Map<String, AtlasCity> _artistCity = {};

  List<AtlasJourney> get journeys => _journeys;
  List<AtlasBattle> get battles => _battles;

  AtlasCountry? countryByIso(String iso) => _countriesByIso[iso.toUpperCase()];
  AtlasCity? cityById(String id) => _citiesById[id];
  List<AtlasCity> citiesInCountry(String iso) =>
      _citiesByCountry[iso.toUpperCase()] ?? const [];
  AtlasCity? cityOfArtist(String name) => _artistCity[name.toLowerCase()];

  int get countryCount => countries.length;
  int get cityCount => cities.length;

  /// Spatial hit-testing: finds which country contains (lat, lng).
  AtlasCountry? countryAt(double lat, double lng) {
    for (final c in countries) {
      if (c.contains(lat, lng)) return c;
    }
    return null;
  }

  /// Unified search over countries, cities, artists, genres, and journeys.
  List<AtlasHit> search(
    String query, {
    String? categoryFilter, // 'all', 'country', 'city', 'artist', 'journey'
    String? regionFilter,
  }) {
    final q = query.trim().toLowerCase();
    final out = <AtlasHit>[];

    // Filter by continent/region if set
    bool matchRegion(String? continent) {
      if (regionFilter == null || regionFilter == 'All') return true;
      if (continent == null) return false;
      return continent.toLowerCase().contains(regionFilter.toLowerCase());
    }

    if (q.isEmpty) {
      // Default suggestions: tier-1 cities and major countries
      if (categoryFilter == null ||
          categoryFilter == 'all' ||
          categoryFilter == 'city') {
        for (final c in cities.where((c) => c.tier == 1)) {
          if (matchRegion(countryByIso(c.iso)?.continent)) {
            out.add(AtlasHit(city: c));
          }
        }
      }
      if (categoryFilter == null ||
          categoryFilter == 'all' ||
          categoryFilter == 'country') {
        for (final c in countries.where((c) => c.hasCharts).take(15)) {
          if (matchRegion(c.continent)) {
            out.add(AtlasHit(country: c));
          }
        }
      }
      return out;
    }

    // 1. Match Countries
    if (categoryFilter == null ||
        categoryFilter == 'all' ||
        categoryFilter == 'country') {
      for (final c in countries) {
        if (!matchRegion(c.continent)) continue;
        if (c.name.toLowerCase().contains(q) ||
            c.iso.toLowerCase() == q ||
            c.continent.toLowerCase().contains(q)) {
          out.add(AtlasHit(country: c));
        }
      }
    }

    // 2. Match Cities
    if (categoryFilter == null ||
        categoryFilter == 'all' ||
        categoryFilter == 'city') {
      for (final c in cities) {
        final country = countryByIso(c.iso);
        if (!matchRegion(country?.continent)) continue;
        if (c.name.toLowerCase().contains(q) ||
            c.country.toLowerCase().contains(q) ||
            c.region.toLowerCase().contains(q)) {
          out.add(AtlasHit(city: c));
        }
      }
    }

    // 3. Match Artists
    if (categoryFilter == null ||
        categoryFilter == 'all' ||
        categoryFilter == 'artist') {
      for (final c in cities) {
        final country = countryByIso(c.iso);
        if (!matchRegion(country?.continent)) continue;
        for (final a in c.artists) {
          if (a.toLowerCase().contains(q)) {
            out.add(AtlasHit(city: c, artist: a));
          }
        }
      }
    }

    // 4. Match Genres
    if (categoryFilter == null ||
        categoryFilter == 'all' ||
        categoryFilter == 'genre') {
      for (final c in cities) {
        for (final g in c.genres) {
          if (g.toLowerCase().contains(q)) {
            out.add(AtlasHit(city: c, genre: g));
          }
        }
      }
    }

    // 5. Match Journeys
    if (categoryFilter == null ||
        categoryFilter == 'all' ||
        categoryFilter == 'journey') {
      for (final j in _journeys) {
        if (j.title.toLowerCase().contains(q) ||
            j.subtitle.toLowerCase().contains(q) ||
            j.description.toLowerCase().contains(q)) {
          out.add(AtlasHit(journey: j));
        }
      }
    }

    // Score and rank results
    out.sort((a, b) {
      final ta = a.title.toLowerCase();
      final tb = b.title.toLowerCase();
      final startsA = ta.startsWith(q);
      final startsB = tb.startsWith(q);
      if (startsA && !startsB) return -1;
      if (!startsA && startsB) return 1;
      return a.title.compareTo(b.title);
    });

    return out.take(35).toList();
  }

  List<AtlasJourney> _buildJourneys() {
    return [
      const AtlasJourney(
        id: 'sounds-of-asia',
        title: 'Sounds of Asia',
        subtitle: 'From Shibuya-kei to K-pop & Tamil Cinema',
        description:
            'A journey through Tokyo neon pop, Seoul modern hits, Bangkok indie, and Chennai cinematic orchestration.',
        heroEmoji: '🌏',
        category: 'Regional Panorama',
        stops: [
          AtlasJourneyStop(
            cityId: 'tokyo',
            cityName: 'Tokyo',
            country: 'Japan',
            iso: 'JP',
            lat: 35.6762,
            lng: 139.6503,
            description: 'Neon synth harmonies and timeless Shibuya-kei.',
            genre: 'City pop & J-rock',
            suggestedArtist: 'YOASOBI',
          ),
          AtlasJourneyStop(
            cityId: 'seoul',
            cityName: 'Seoul',
            country: 'South Korea',
            iso: 'KR',
            lat: 37.5665,
            lng: 126.9780,
            description: 'Global pop precision and soulful Korean R&B.',
            genre: 'K-pop & K-hiphop',
            suggestedArtist: 'NewJeans',
          ),
          AtlasJourneyStop(
            cityId: 'bangkok',
            cityName: 'Bangkok',
            country: 'Thailand',
            iso: 'TH',
            lat: 13.7563,
            lng: 100.5018,
            description: 'Vibrant Thai indie and modern city grooves.',
            genre: 'T-pop & Luk Thung',
            suggestedArtist: 'MILLI',
          ),
          AtlasJourneyStop(
            cityId: 'chennai',
            cityName: 'Chennai',
            country: 'India',
            iso: 'IN',
            lat: 13.0827,
            lng: 80.2707,
            description:
                'Mesmerizing Carnatic fusion and world-renowned film scores.',
            genre: 'Film music & Carnatic',
            suggestedArtist: 'A. R. Rahman',
          ),
        ],
      ),
      const AtlasJourney(
        id: 'underground-europe',
        title: 'Underground Europe',
        subtitle: 'Techno, Post-punk & French Touch',
        description:
            'Traverse the legendary clubs of Berlin, the Britpop streets of Manchester, and Parisian analog synths.',
        heroEmoji: '⚡',
        category: 'Electronic & Indie',
        stops: [
          AtlasJourneyStop(
            cityId: 'berlin',
            cityName: 'Berlin',
            country: 'Germany',
            iso: 'DE',
            lat: 52.5200,
            lng: 13.4050,
            description:
                'Raw industrial techno and hypnotic minimalist rhythms.',
            genre: 'Berlin Techno',
            suggestedArtist: 'Paul van Dyk',
          ),
          AtlasJourneyStop(
            cityId: 'amsterdam',
            cityName: 'Amsterdam',
            country: 'Netherlands',
            iso: 'NL',
            lat: 52.3676,
            lng: 4.9041,
            description:
                'Euphoric festival anthems and melodic progressive house.',
            genre: 'Dutch EDM',
            suggestedArtist: 'Armin van Buuren',
          ),
          AtlasJourneyStop(
            cityId: 'paris',
            cityName: 'Paris',
            country: 'France',
            iso: 'FR',
            lat: 48.8566,
            lng: 2.3522,
            description:
                'Filtered disco house, French touch, and cinematic elegance.',
            genre: 'French Touch & Chanson',
            suggestedArtist: 'Daft Punk',
          ),
          AtlasJourneyStop(
            cityId: 'london',
            cityName: 'London',
            country: 'United Kingdom',
            iso: 'GB',
            lat: 51.5074,
            lng: -0.1278,
            description: 'Grime, drill, and boundary-pushing electronic beats.',
            genre: 'Grime & Britpop',
            suggestedArtist: 'Stormzy',
          ),
        ],
      ),
      const AtlasJourney(
        id: 'tamil-musical-journey',
        title: 'Tamil Musical Heritage',
        subtitle: 'From Chennai Studios to Global Arenas',
        description:
            'Trace the evolution of Tamil music from classical Carnatic roots to Kodambakkam film magic and diaspora pop.',
        heroEmoji: '🪕',
        category: 'Cultural Deep Dive',
        stops: [
          AtlasJourneyStop(
            cityId: 'chennai',
            cityName: 'Chennai',
            country: 'India',
            iso: 'IN',
            lat: 13.0827,
            lng: 80.2707,
            description:
                'The epicenter of South Indian cinema music and legendary recording studios.',
            genre: 'Film Score & Kuthu',
            suggestedArtist: 'Ilaiyaraaja',
          ),
          AtlasJourneyStop(
            cityId: 'kochi',
            cityName: 'Kochi',
            country: 'India',
            iso: 'IN',
            lat: 9.9312,
            lng: 76.2673,
            description:
                'Acoustic Malayalam melodies and cross-border musical synergy.',
            genre: 'Indie Folk & Film',
            suggestedArtist: 'Sushin Shyam',
          ),
          AtlasJourneyStop(
            cityId: 'singapore',
            cityName: 'Singapore',
            country: 'Singapore',
            iso: 'SG',
            lat: 1.3521,
            lng: 103.8198,
            description:
                'Southeast Asian diaspora fusion and indie Tamil releases.',
            genre: 'Global Tamil Fusion',
            suggestedArtist: 'Stephen Zechariah',
          ),
        ],
      ),
      const AtlasJourney(
        id: 'afrobeats-pulse',
        title: 'Afrobeats Pulse',
        subtitle: 'Lagos to Accra, London & Johannesburg',
        description:
            'Experience the infectious percussion, Amapiano log drums, and global African rhythms taking over the charts.',
        heroEmoji: '🥁',
        category: 'Global Rhythm',
        stops: [
          AtlasJourneyStop(
            cityId: 'lagos',
            cityName: 'Lagos',
            country: 'Nigeria',
            iso: 'NG',
            lat: 6.5244,
            lng: 3.3792,
            description: 'The undisputed heartbeat of modern Afrobeats.',
            genre: 'Afro-fusion',
            suggestedArtist: 'Burna Boy',
          ),
          AtlasJourneyStop(
            cityId: 'accra',
            cityName: 'Accra',
            country: 'Ghana',
            iso: 'GH',
            lat: 5.6037,
            lng: -0.1870,
            description: 'Sweet Highlife melodies and contemporary Afro-dance.',
            genre: 'Highlife & Hiplife',
            suggestedArtist: 'King Promise',
          ),
          AtlasJourneyStop(
            cityId: 'johannesburg',
            cityName: 'Johannesburg',
            country: 'South Africa',
            iso: 'ZA',
            lat: -26.2041,
            lng: 28.0473,
            description: 'Deep Amapiano basslines and hypnotic percussion.',
            genre: 'Amapiano',
            suggestedArtist: 'Kabza De Small',
          ),
        ],
      ),
      const AtlasJourney(
        id: 'jazz-route',
        title: 'The Jazz Route',
        subtitle: 'New Orleans to Chicago, New York & Paris',
        description:
            'Follow the historic migration of jazz from Congo Square through Chicago clubs and Manhattan lofts to Saint-Germain.',
        heroEmoji: '🎷',
        category: 'Historic Legacy',
        stops: [
          AtlasJourneyStop(
            cityId: 'new_orleans',
            cityName: 'New Orleans',
            country: 'United States',
            iso: 'US',
            lat: 29.9511,
            lng: -90.0715,
            description:
                'The birthplace of jazz, brass bands, and deep syncopation.',
            genre: 'Traditional Jazz',
            suggestedArtist: 'Louis Armstrong',
          ),
          AtlasJourneyStop(
            cityId: 'chicago',
            cityName: 'Chicago',
            country: 'United States',
            iso: 'US',
            lat: 41.8781,
            lng: -87.6298,
            description: 'Electric blues and roaring mid-century hard bop.',
            genre: 'Chicago Blues & Jazz',
            suggestedArtist: 'Common',
          ),
          AtlasJourneyStop(
            cityId: 'new_york',
            cityName: 'New York',
            country: 'United States',
            iso: 'US',
            lat: 40.7128,
            lng: -74.0060,
            description: 'Harlem renaissance and modern jazz vanguard.',
            genre: 'Bebop & Modern Jazz',
            suggestedArtist: 'Miles Davis',
          ),
          AtlasJourneyStop(
            cityId: 'paris',
            cityName: 'Paris',
            country: 'France',
            iso: 'FR',
            lat: 48.8566,
            lng: 2.3522,
            description:
                'Gypsy jazz, Saint-Germain-des-Prés, and European warmth.',
            genre: 'French Jazz Manouche',
            suggestedArtist: 'Django Reinhardt',
          ),
        ],
      ),
    ];
  }

  List<AtlasBattle> _buildBattles() {
    final chennai = cityById('chennai');
    final mumbai = cityById('mumbai');
    final tokyo = cityById('tokyo');
    final seoul = cityById('seoul');
    final london = cityById('london');
    final berlin = cityById('berlin');

    final battles = <AtlasBattle>[];
    if (chennai != null && mumbai != null) {
      battles.add(
        AtlasBattle(
          id: 'chennai-vs-mumbai',
          cityA: chennai,
          cityB: mumbai,
          title: 'Chennai vs Mumbai',
          tagline: 'Carnatic Cinematic Magic vs Gully Rap & Bollywood',
          votesA: 3420,
          votesB: 3180,
        ),
      );
    }
    if (tokyo != null && seoul != null) {
      battles.add(
        AtlasBattle(
          id: 'tokyo-vs-seoul',
          cityA: tokyo,
          cityB: seoul,
          title: 'Tokyo vs Seoul',
          tagline: 'City Pop & Anime Symphonies vs K-Pop & Korean R&B',
          votesA: 4190,
          votesB: 4520,
        ),
      );
    }
    if (london != null && berlin != null) {
      battles.add(
        AtlasBattle(
          id: 'london-vs-berlin',
          cityA: london,
          cityB: berlin,
          title: 'London vs Berlin',
          tagline: 'Grime & Britpop vs Industrial Techno & Minimal',
          votesA: 2890,
          votesB: 3120,
        ),
      );
    }
    return battles;
  }
}

class AtlasRepository {
  AtlasRepository._();
  static final AtlasRepository instance = AtlasRepository._();

  Future<AtlasData>? _future;
  AtlasData? _data;
  AtlasData? get data => _data;

  List<AtlasCity> citiesInCountry(String iso) =>
      _data?.citiesInCountry(iso) ?? const [];
  AtlasCity? cityById(String id) => _data?.cityById(id);

  Future<AtlasData> load() => _future ??= _load();

  Future<AtlasData> _load() async {
    final results = await Future.wait([
      rootBundle.loadString('assets/atlas/countries_geo.json'),
      rootBundle.loadString('assets/atlas/cities.json'),
    ]);

    final rawCountries = (jsonDecode(results[0]) as Map)['countries'] as List;
    final countries = [
      for (final j in rawCountries)
        AtlasCountry.fromJson(j as Map<String, dynamic>),
    ];

    final rawCities = (jsonDecode(results[1]) as Map)['cities'] as List;
    final cities = [
      for (final j in rawCities) AtlasCity.fromJson(j as Map<String, dynamic>),
    ];

    return _data = AtlasData(countries, cities);
  }
}
