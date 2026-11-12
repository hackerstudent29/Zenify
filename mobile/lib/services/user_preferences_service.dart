import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';
import 'country_service.dart';

/// Immutable artist selection saved during onboarding or edited from settings.
class OnboardingArtist {
  final String id;
  final String name;
  final String image;

  const OnboardingArtist({
    required this.id,
    required this.name,
    this.image = '',
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'image': image,
        'source': 'innertube',
      };

  factory OnboardingArtist.fromJson(Map<String, dynamic> json) => OnboardingArtist(
        id: (json['id'] as String?) ?? (json['name'] as String? ?? ''),
        name: (json['name'] as String?) ?? '',
        image: (json['image'] as String?) ?? '',
      );
}

/// Persisted user music taste & region preferences.
class OnboardingPrefs {
  final String displayName;
  final int? age;
  final String? gender;
  final String countryCode;
  final String countryName;
  final List<String> languages;
  final List<String> genres;
  final List<OnboardingArtist> favoriteArtists;
  final bool completed;

  const OnboardingPrefs({
    this.displayName = '',
    this.age,
    this.gender,
    this.countryCode = 'IN',
    this.countryName = 'India',
    this.languages = const [],
    this.genres = const [],
    this.favoriteArtists = const [],
    this.completed = false,
  });

  String? get primaryLanguage => languages.isNotEmpty ? languages.first : null;
  String? get primaryGenre => genres.isNotEmpty ? genres.first : null;
  String? get primaryArtist =>
      favoriteArtists.isNotEmpty ? favoriteArtists.first.name : null;
  String? get secondaryArtist =>
      favoriteArtists.length > 1 ? favoriteArtists[1].name : null;

  OnboardingPrefs copyWith({
    String? displayName,
    int? age,
    bool clearAge = false,
    String? gender,
    bool clearGender = false,
    String? countryCode,
    String? countryName,
    List<String>? languages,
    List<String>? genres,
    List<OnboardingArtist>? favoriteArtists,
    bool? completed,
  }) =>
      OnboardingPrefs(
        displayName: displayName ?? this.displayName,
        age: clearAge ? null : (age ?? this.age),
        gender: clearGender ? null : (gender ?? this.gender),
        countryCode: countryCode ?? this.countryCode,
        countryName: countryName ?? this.countryName,
        languages: languages ?? this.languages,
        genres: genres ?? this.genres,
        favoriteArtists: favoriteArtists ?? this.favoriteArtists,
        completed: completed ?? this.completed,
      );

  Map<String, dynamic> toJson() => {
        'displayName': displayName,
        if (age != null) 'age': age,
        if (gender != null && gender!.isNotEmpty) 'gender': gender,
        'countryCode': countryCode,
        'countryName': countryName,
        'languages': languages,
        'genres': genres,
        'favoriteArtists': favoriteArtists.map((a) => a.toJson()).toList(),
        'completed': completed,
      };

  factory OnboardingPrefs.fromJson(Map<String, dynamic> json) {
    final rawArtists = json['favoriteArtists'] as List? ?? const [];
    final rawAge = json['age'];
    final parsedAge = rawAge is num ? rawAge.toInt() : int.tryParse(rawAge?.toString() ?? '');
    final rawGender = (json['gender'] as String?)?.trim();
    return OnboardingPrefs(
      displayName: (json['displayName'] as String?) ?? '',
      age: (parsedAge != null && parsedAge >= 13 && parsedAge <= 100) ? parsedAge : null,
      gender: (rawGender != null && rawGender.isNotEmpty) ? rawGender : null,
      countryCode: (json['countryCode'] as String?) ?? 'IN',
      countryName: (json['countryName'] as String?) ?? 'India',
      languages: (json['languages'] as List? ?? const [])
          .map((e) => e.toString())
          .where((e) => e.isNotEmpty)
          .toList(),
      genres: (json['genres'] as List? ?? const [])
          .map((e) => e.toString())
          .where((e) => e.isNotEmpty)
          .toList(),
      favoriteArtists: rawArtists
          .whereType<Map>()
          .map((m) => OnboardingArtist.fromJson(Map<String, dynamic>.from(m)))
          .where((a) => a.name.isNotEmpty)
          .toList(),
      completed: json['completed'] == true,
    );
  }
}

class OnboardingLanguageOption {
  final String name;
  final String nativeLabel;
  final bool isIndian;
  final List<String> regionCodes;

  const OnboardingLanguageOption({
    required this.name,
    required this.nativeLabel,
    this.isIndian = false,
    this.regionCodes = const [],
  });
}

/// Manages local + remote onboarding taste preferences and verified catalog options
/// that are guaranteed to return real music from YouTube Music InnerTube.
class UserPreferencesService {
  UserPreferencesService._();
  static final UserPreferencesService instance = UserPreferencesService._();

  static const String _storageKey = 'zenify_onboarding_prefs_v1';

  final ValueNotifier<OnboardingPrefs?> prefsNotifier =
      ValueNotifier<OnboardingPrefs?>(null);

  OnboardingPrefs? get current => prefsNotifier.value;
  bool get hasCompleted => prefsNotifier.value?.completed == true;

  static const List<String> genderOptions = [
    'Male',
    'Female',
    'Non-binary',
    'Prefer not to say',
  ];

  /// Resolves the single authoritative display name across Profile, Settings, and sheets.
  static String resolveDisplayName({String? accountName, String? displayName, String? username}) {
    final saved = instance.current?.displayName.trim();
    if (saved != null && saved.isNotEmpty) return saved;
    final dn = displayName?.trim();
    if (dn != null && dn.isNotEmpty && dn != 'Guest Listener') return dn;
    final acc = accountName?.trim();
    if (acc != null && acc.isNotEmpty && acc != 'Zenify Guest' && acc != 'Guest Listener') return acc;
    final un = username?.trim();
    if (un != null && un.isNotEmpty && un != 'guest' && un != 'Guest Listener') return un;
    return 'Listener';
  }

  /// Only languages verified against InnerTube category hubs / dedicated charts.
  static const List<OnboardingLanguageOption> verifiedLanguages = [
    OnboardingLanguageOption(name: 'Tamil', nativeLabel: 'தமிழ்', isIndian: true, regionCodes: ['IN']),
    OnboardingLanguageOption(name: 'Hindi', nativeLabel: 'हिन्दी', isIndian: true, regionCodes: ['IN', 'AE']),
    OnboardingLanguageOption(name: 'Malayalam', nativeLabel: 'മലയാളം', isIndian: true, regionCodes: ['IN', 'AE']),
    OnboardingLanguageOption(name: 'Telugu', nativeLabel: 'తెలుగు', isIndian: true, regionCodes: ['IN']),
    OnboardingLanguageOption(name: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ', isIndian: true, regionCodes: ['IN', 'CA', 'GB']),
    OnboardingLanguageOption(name: 'Kannada', nativeLabel: 'ಕನ್ನಡ', isIndian: true, regionCodes: ['IN']),
    OnboardingLanguageOption(name: 'Marathi', nativeLabel: 'मराठी', isIndian: true, regionCodes: ['IN']),
    OnboardingLanguageOption(name: 'Bengali', nativeLabel: 'বাংলা', isIndian: true, regionCodes: ['IN']),
    OnboardingLanguageOption(name: 'Gujarati', nativeLabel: 'ગુજરાતી', isIndian: true, regionCodes: ['IN']),
    OnboardingLanguageOption(name: 'Haryanvi', nativeLabel: 'हरियाणवी', isIndian: true, regionCodes: ['IN']),
    OnboardingLanguageOption(name: 'Bhojpuri', nativeLabel: 'भोजपुरी', isIndian: true, regionCodes: ['IN']),
    OnboardingLanguageOption(
      name: 'English',
      nativeLabel: 'International',
      regionCodes: ['US', 'GB', 'CA', 'AU', 'IN', 'DE', 'FR', 'AE'],
    ),
    OnboardingLanguageOption(name: 'Korean', nativeLabel: '한국어 · K-Pop', regionCodes: ['KR', 'US', 'IN']),
    OnboardingLanguageOption(name: 'Japanese', nativeLabel: '日本語 · J-Pop', regionCodes: ['JP', 'US']),
    OnboardingLanguageOption(name: 'Spanish', nativeLabel: 'Español · Latin', regionCodes: ['US', 'BR']),
    OnboardingLanguageOption(name: 'Arabic', nativeLabel: 'العربية', regionCodes: ['AE', 'FR']),
    OnboardingLanguageOption(name: 'African', nativeLabel: 'Afrobeats & Global', regionCodes: ['GB', 'US', 'FR']),
  ];

  /// Genres & vibes verified to exist as InnerTube hubs or crisp queries.
  static const List<String> verifiedGenres = [
    'Film Music',
    'Pop',
    'Indie',
    'Hip-Hop',
    'R&B & Soul',
    'Dance & Electronic',
    'Rock',
    'Folk & Acoustic',
    'Carnatic',
    'Hindustani',
    'Ghazal & Sufi',
    'Devotional',
    'Jazz',
    'Classical',
    'Lo-fi & Chill',
    'Romance',
    'Party',
    'Workout',
    'Focus',
    'Sleep',
  ];

  static const Set<String> _indianStyleGenres = {
    'Film Music',
    'Carnatic',
    'Hindustani',
    'Ghazal & Sufi',
    'Devotional',
    'Folk & Acoustic',
    'Indie',
    'Romance',
    'Party',
    'Lo-fi & Chill',
  };

  static const Map<String, List<String>> _curatedArtistsByLang = {
    'Tamil': [
      'A.R. Rahman',
      'Anirudh Ravichander',
      'Yuvan Shankar Raja',
      'Ilaiyaraaja',
      'Harris Jayaraj',
      'G.V. Prakash Kumar',
      'Santhosh Narayanan',
      'Sid Sriram',
      'Pradeep Kumar',
      'Shreya Ghoshal',
      'Hiphop Tamizha',
      'Sai Abhyankkar',
    ],
    'Hindi': [
      'Arijit Singh',
      'Pritam',
      'Shreya Ghoshal',
      'A.R. Rahman',
      'Amit Trivedi',
      'Vishal-Shekhar',
      'Jubin Nautiyal',
      'Sunidhi Chauhan',
      'KK',
      'Anuv Jain',
      'Mitraz',
      'Sachin-Jigar',
    ],
    'Malayalam': [
      'Sushin Shyam',
      'K.S. Chithra',
      'Vineeth Sreenivasan',
      'Shaan Rahman',
      'Gopi Sundar',
      'Thaikkudam Bridge',
      'Job Kurian',
      'Vishnu Vijay',
      'Hesham Abdul Wahab',
      'K.J. Yesudas',
    ],
    'Telugu': [
      'Devi Sri Prasad',
      'Thaman S',
      'M.M. Keeravaani',
      'Sid Sriram',
      'Anurag Kulkarni',
      'Mickey J Meyer',
      'Anirudh Ravichander',
      'Shreya Ghoshal',
      'S.P. Balasubrahmanyam',
      'Hesham Abdul Wahab',
    ],
    'Punjabi': [
      'Diljit Dosanjh',
      'Karan Aujla',
      'AP Dhillon',
      'Shubh',
      'Sidhu Moose Wala',
      'Talwiinder',
      'B Praak',
      'Harrdy Sandhu',
      'Gurinder Gill',
      'Satinder Sartaaj',
    ],
    'Kannada': [
      'Vijay Prakash',
      'Sanjith Hegde',
      'Raghu Dixit',
      'Arjun Janya',
      'B. Ajaneesh Loknath',
      'Sonu Nigam',
      'Vasuki Vaibhav',
      'Charan Raj',
    ],
    'Marathi': [
      'Ajay-Atul',
      'Shankar Mahadevan',
      'Bela Shende',
      'Avadhoot Gupte',
      'Vaishali Samant',
      'Amitraj',
    ],
    'Bengali': [
      'Arijit Singh',
      'Anupam Roy',
      'Shreya Ghoshal',
      'Nachiketa Chakraborty',
      'Fossils',
      'Rupam Islam',
    ],
    'Gujarati': [
      'Jigardan Gadhavi',
      'Aditya Gadhvi',
      'Kinjal Dave',
      'Geeta Rabari',
      'Darshan Raval',
      'Sachin-Jigar',
    ],
    'Haryanvi': [
      'Masoom Sharma',
      'Dhanda Nyoliwala',
      'Sapna Choudhary',
      'Gulzaar Chhaniwala',
      'Khasa Aala Chahar',
      'Sumit Parta',
    ],
    'Bhojpuri': [
      'Pawan Singh',
      'Khesari Lal Yadav',
      'Shilpi Raj',
      'Manoj Tiwari',
      'Ritesh Pandey',
      'Neelkamal Singh',
    ],
    'English': [
      'The Weeknd',
      'Taylor Swift',
      'Billie Eilish',
      'Kendrick Lamar',
      'Coldplay',
      'SZA',
      'Bruno Mars',
      'Fred again..',
      'Tame Impala',
      'Dua Lipa',
      'Drake',
      'Sabrina Carpenter',
    ],
    'Korean': [
      'BTS',
      'BLACKPINK',
      'NewJeans',
      'SEVENTEEN',
      'IU',
      'Stray Kids',
      'aespa',
      'Jung Kook',
      'LE SSERAFIM',
      'DAY6',
    ],
    'Japanese': [
      'YOASOBI',
      'Kenshi Yonezu',
      'Fujii Kaze',
      'Ado',
      'Official HIGE DANdism',
      'Mrs. GREEN APPLE',
      'Vaundy',
      'King Gnu',
    ],
    'Spanish': [
      'Bad Bunny',
      'Karol G',
      'Feid',
      'Rosalía',
      'Shakira',
      'Rauw Alejandro',
      'Peso Pluma',
      'Quevedo',
    ],
    'Arabic': [
      'Amr Diab',
      'Fairuz',
      'Wegz',
      'Nancy Ajram',
      'Sherine',
      'Tamer Hosny',
      'Elissa',
      'Saint Levant',
    ],
    'African': [
      'Burna Boy',
      'Wizkid',
      'Tems',
      'Rema',
      'Asake',
      'Ayra Starr',
      'Davido',
      'Tyla',
    ],
  };

  /// Silently detects the best matching supported region from device locale without
  /// triggering OS location permission dialogs.
  static CountryInfo detectRegionSilently() {
    final localeCode = PlatformDispatcher.instance.locale.countryCode?.toUpperCase();
    if (localeCode != null && localeCode.isNotEmpty) {
      for (final c in CountryService.supportedCountries) {
        if (c.code == localeCode) return c;
      }
      // Map closely related language/region locales to the nearest verified hub.
      const fallbackRegionMap = {
        'SG': 'IN',
        'MY': 'IN',
        'LK': 'IN',
        'NP': 'IN',
        'BD': 'IN',
        'PK': 'IN',
        'NZ': 'AU',
        'IE': 'GB',
        'NG': 'GB',
        'GH': 'GB',
        'ZA': 'GB',
        'MX': 'US',
        'ES': 'US',
        'AR': 'US',
        'CO': 'US',
        'SA': 'AE',
        'QA': 'AE',
        'KW': 'AE',
        'AT': 'DE',
        'CH': 'DE',
      };
      final mapped = fallbackRegionMap[localeCode];
      if (mapped != null) {
        for (final c in CountryService.supportedCountries) {
          if (c.code == mapped) return c;
        }
      }
    }
    return CountryService.instance.currentCountry;
  }

  /// Suggests initial default languages only to sort/highlight relevant chips first.
  static List<OnboardingLanguageOption> sortedLanguagesForCountry(String countryCode) {
    final code = countryCode.toUpperCase();
    final copy = List<OnboardingLanguageOption>.from(verifiedLanguages);
    copy.sort((a, b) {
      final aMatch = a.regionCodes.contains(code) ? 0 : 1;
      final bMatch = b.regionCodes.contains(code) ? 0 : 1;
      if (aMatch != bMatch) return aMatch - bMatch;
      // Within matching region, prioritize non-English local languages slightly in KR/JP/AE/IN
      if (code == 'IN' && a.isIndian != b.isIndian) return a.isIndian ? -1 : 1;
      return 0;
    });
    return copy;
  }

  /// Sorts verified genres so genres matching selected languages appear first.
  static List<String> sortedGenresForLanguages(List<String> selectedLanguages) {
    final hasIndian = selectedLanguages.any((name) =>
        verifiedLanguages.any((l) => l.name == name && l.isIndian));
    final copy = List<String>.from(verifiedGenres);
    if (!hasIndian) {
      // Put global mainstream genres first when no Indian language is picked.
      copy.sort((a, b) {
        final aIndianOnly = _indianOnlyGenre(a) ? 1 : 0;
        final bIndianOnly = _indianOnlyGenre(b) ? 1 : 0;
        return aIndianOnly - bIndianOnly;
      });
    } else {
      copy.sort((a, b) {
        final aPref = _indianStyleGenres.contains(a) ? 0 : 1;
        final bPref = _indianStyleGenres.contains(b) ? 0 : 1;
        return aPref - bPref;
      });
    }
    return copy;
  }

  static bool _indianOnlyGenre(String g) =>
      g == 'Film Music' ||
      g == 'Carnatic' ||
      g == 'Hindustani' ||
      g == 'Ghazal & Sufi' ||
      g == 'Devotional';

  /// Returns deduplicated curated starter artist names aligned with chosen languages.
  static List<String> curatedArtistsForLanguages(List<String> languages) {
    final langs = languages.isEmpty ? const ['English'] : languages;
    final out = <String>[];
    final seen = <String>{};
    // Interleave across chosen languages so multi-lingual users see a balanced grid.
    int round = 0;
    bool addedAny = true;
    while (addedAny && out.length < 24) {
      addedAny = false;
      for (final lang in langs) {
        final list = _curatedArtistsByLang[lang];
        if (list != null && round < list.length) {
          addedAny = true;
          final name = list[round];
          if (seen.add(name.toLowerCase())) {
            out.add(name);
            if (out.length >= 24) break;
          }
        }
      }
      round++;
    }
    if (out.isEmpty) {
      out.addAll(_curatedArtistsByLang['English'] ?? const []);
    }
    return out;
  }

  Future<void> ensureLoaded() => prefsNotifier.value == null ? init() : Future.value();

  Future<void> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_storageKey);
      if (raw != null && raw.isNotEmpty) {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) {
          prefsNotifier.value = OnboardingPrefs.fromJson(decoded);
        } else if (decoded is Map) {
          prefsNotifier.value = OnboardingPrefs.fromJson(Map<String, dynamic>.from(decoded));
        }
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[UserPreferencesService] init error: $e');
    }
  }

  Future<void> save(OnboardingPrefs next, {bool syncRemote = true}) async {
    prefsNotifier.value = next;

    // 1. Keep CountryService aligned with chosen verified region
    final matchedCountry = CountryService.supportedCountries.firstWhere(
      (c) => c.code == next.countryCode.toUpperCase(),
      orElse: () => CountryService.instance.currentCountry,
    );
    await CountryService.instance.setCountry(matchedCountry);

    // 2. Persist locally
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_storageKey, jsonEncode(next.toJson()));
    } catch (e) {
      if (kDebugMode) debugPrint('[UserPreferencesService] local save error: $e');
    }

    // 3. Best-effort sync to backend when signed in
    if (syncRemote && ApiService.authToken != null) {
      await _syncToBackend(next);
    }
  }

  Future<void> clearLocal() async {
    prefsNotifier.value = null;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_storageKey);
    } catch (_) {}
  }

  Future<void> _syncToBackend(OnboardingPrefs next) async {
    final token = ApiService.authToken;
    if (token == null || token.isEmpty) return;
    try {
      final body = jsonEncode({
        'country': next.countryName,
        if (next.age != null) 'age': next.age,
        if (next.gender != null && next.gender!.isNotEmpty) 'gender': next.gender,
        'languages': next.languages.take(6).toList(),
        'preferredGenres': next.genres.take(8).toList(),
        'favoriteArtists': next.favoriteArtists.take(10).map((a) => a.toJson()).toList(),
      });
      await http
          .put(
            Uri.parse('${ApiService.baseUrl}/api/preferences'),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $token',
            },
            body: body,
          )
          .timeout(const Duration(seconds: 8));
    } catch (e) {
      if (kDebugMode) debugPrint('[UserPreferencesService] remote sync skipped: $e');
    }
  }
}

