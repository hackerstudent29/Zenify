import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/country_service.dart';
import 'package:mobile/views/explore/explore_data_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('ExploreDataService & Country Synchronization', () {
    test('kExploreCountries includes all CountryService supportedCountries', () {
      final supportedCodes = CountryService.supportedCountries.map((c) => c.code.toUpperCase()).toSet();
      final exploreCodes = kExploreCountries.map((c) => c.code.toUpperCase()).toSet();

      for (final code in supportedCodes) {
        expect(exploreCodes.contains(code), isTrue,
            reason: 'Explore countries should include default country $code');
      }
      expect(exploreCodes.contains('GLOBAL'), isTrue);
    });

    test('setting country updates currentCountry and persists', () async {
      final service = ExploreDataService.instance;
      final target = kExploreCountries.firstWhere((c) => c.code == 'JP');

      await service.setCountry(target);
      expect(service.currentCountry.code, 'JP');
      expect(CountryService.instance.currentCode, 'JP');
    });

    test('getSortedGenres prioritizes user onboarding genres', () {
      final service = ExploreDataService.instance;
      final sorted = service.getSortedGenres(
        preferredGenres: ['Rock'],
        preferredLanguages: ['Tamil'],
      );

      expect(sorted.first.title.toLowerCase().contains('rock') ||
          sorted.first.title.toLowerCase().contains('tamil'), isTrue);
    });
  });
}
