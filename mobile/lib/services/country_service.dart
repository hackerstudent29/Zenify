import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class CountryInfo {
  const CountryInfo({
    required this.code,
    required this.name,
    required this.flag,
  });

  final String code;
  final String name;
  final String flag;

  String get displayName => '$flag  $name';
}

/// Service managing the user's preferred music country/region for YouTube Music.
class CountryService {
  CountryService._();
  static final CountryService instance = CountryService._();

  static const _prefKey = 'zenify_selected_country_code';

  static const List<CountryInfo> supportedCountries = [
    CountryInfo(code: 'IN', name: 'India', flag: '🇮🇳'),
    CountryInfo(code: 'US', name: 'United States', flag: '🇺🇸'),
    CountryInfo(code: 'GB', name: 'United Kingdom', flag: '🇬🇧'),
    CountryInfo(code: 'DE', name: 'Germany', flag: '🇩🇪'),
    CountryInfo(code: 'CA', name: 'Canada', flag: '🇨🇦'),
    CountryInfo(code: 'AU', name: 'Australia', flag: '🇦🇺'),
    CountryInfo(code: 'JP', name: 'Japan', flag: '🇯🇵'),
    CountryInfo(code: 'FR', name: 'France', flag: '🇫🇷'),
    CountryInfo(code: 'BR', name: 'Brazil', flag: '🇧🇷'),
    CountryInfo(code: 'KR', name: 'South Korea', flag: '🇰🇷'),
    CountryInfo(code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪'),
  ];

  static const CountryInfo defaultCountry =
      CountryInfo(code: 'IN', name: 'India', flag: '🇮🇳');

  final ValueNotifier<CountryInfo> countryNotifier =
      ValueNotifier<CountryInfo>(defaultCountry);

  CountryInfo get currentCountry => countryNotifier.value;
  String get currentCode => countryNotifier.value.code;

  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedCode = prefs.getString(_prefKey);
      if (savedCode != null) {
        final match = supportedCountries.firstWhere(
          (c) => c.code.toUpperCase() == savedCode.toUpperCase(),
          orElse: () => defaultCountry,
        );
        countryNotifier.value = match;
      }
    } catch (e) {
      if (kDebugMode) debugPrint('[CountryService] init error: $e');
    }
  }

  Future<void> setCountry(CountryInfo country) async {
    if (countryNotifier.value.code == country.code) return;
    countryNotifier.value = country;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefKey, country.code);
    } catch (e) {
      if (kDebugMode) debugPrint('[CountryService] save error: $e');
    }
  }
}

