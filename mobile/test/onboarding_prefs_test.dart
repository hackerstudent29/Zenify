import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile/services/auth_state.dart';
import 'package:mobile/services/country_service.dart';
import 'package:mobile/services/dock_visibility.dart';
import 'package:mobile/services/player_state.dart';
import 'package:mobile/services/settings_service.dart';
import 'package:mobile/services/together_service.dart';
import 'package:mobile/services/user_preferences_service.dart';
import 'package:mobile/views/auth/onboarding_sheet.dart';
import 'package:mobile/views/insights/insights_screen.dart';
import 'package:mobile/views/profile/profile_screen.dart';
import 'package:mobile/views/room_together/room_together_screen.dart';
import 'package:mobile/views/settings/settings_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await CountryService.instance.init();
    await UserPreferencesService.instance.clearLocal();
  });

  test('OnboardingPrefs serializes and restores age, gender, and tastes cleanly', () {
    const original = OnboardingPrefs(
      displayName: 'Karthik',
      age: 23,
      gender: 'Male',
      countryCode: 'IN',
      countryName: 'India',
      languages: ['Tamil', 'English'],
      genres: ['Film Music', 'Indie'],
      favoriteArtists: [
        OnboardingArtist(id: 'ar-1', name: 'A.R. Rahman', image: 'https://example.com/ar.jpg'),
        OnboardingArtist(id: 'ani-2', name: 'Anirudh Ravichander'),
        OnboardingArtist(id: 'sid-3', name: 'Sid Sriram'),
      ],
      completed: true,
    );

    final restored = OnboardingPrefs.fromJson(original.toJson());
    expect(restored.displayName, 'Karthik');
    expect(restored.age, 23);
    expect(restored.gender, 'Male');
    expect(restored.countryCode, 'IN');
    expect(restored.languages, ['Tamil', 'English']);
    expect(restored.genres, ['Film Music', 'Indie']);
    expect(restored.primaryLanguage, 'Tamil');
    expect(restored.primaryArtist, 'A.R. Rahman');
    expect(restored.secondaryArtist, 'Anirudh Ravichander');
    expect(restored.completed, isTrue);
  });

  test('UserPreferencesService persists age & gender and resolves display name cleanly', () async {
    const prefs = OnboardingPrefs(
      displayName: 'Minji',
      age: 21,
      gender: 'Female',
      countryCode: 'KR',
      countryName: 'South Korea',
      languages: ['Korean', 'English'],
      genres: ['Pop', 'Indie'],
      favoriteArtists: [
        OnboardingArtist(id: '1', name: 'NewJeans'),
        OnboardingArtist(id: '2', name: 'IU'),
        OnboardingArtist(id: '3', name: 'DAY6'),
      ],
      completed: true,
    );

    await UserPreferencesService.instance.save(prefs, syncRemote: false);
    expect(CountryService.instance.currentCode, 'KR');
    expect(UserPreferencesService.instance.current?.age, 21);
    expect(UserPreferencesService.instance.current?.gender, 'Female');
    expect(
      UserPreferencesService.resolveDisplayName(accountName: 'Guest Listener'),
      'Minji',
    );

    // Clear in-memory notifier state via fresh init reading SharedPreferences
    UserPreferencesService.instance.prefsNotifier.value = null;
    await UserPreferencesService.instance.init();

    expect(UserPreferencesService.instance.hasCompleted, isTrue);
    expect(UserPreferencesService.instance.current?.languages, ['Korean', 'English']);
    expect(UserPreferencesService.instance.current?.countryCode, 'KR');
    expect(UserPreferencesService.instance.current?.age, 21);
    expect(UserPreferencesService.instance.current?.gender, 'Female');
  });

  test('Region language sorting puts regional languages first and curates artists uniquely', () {
    final krSorted = UserPreferencesService.sortedLanguagesForCountry('KR');
    expect(krSorted.first.name, 'Korean');

    final inSorted = UserPreferencesService.sortedLanguagesForCountry('IN');
    expect(inSorted.take(5).every((l) => l.isIndian), isTrue);

    final indianGenres = UserPreferencesService.sortedGenresForLanguages(['Tamil']);
    expect(indianGenres.first, 'Film Music');

    final artists = UserPreferencesService.curatedArtistsForLanguages(['Tamil', 'Hindi']);
    final lowerSet = artists.map((e) => e.toLowerCase()).toSet();
    expect(lowerSet.length, artists.length);
    expect(artists, contains('A.R. Rahman'));
    expect(artists, contains('Arijit Singh'));
  });

  testWidgets(
      'OnboardingSheet collects Name, Age, Gender, hides miniplayer while active, and finishes 4 steps',
      (tester) async {
    bool completedCalled = false;

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>(
        create: (_) => AuthState(),
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => Center(
                child: ElevatedButton(
                  onPressed: () {
                    OnboardingSheet.show(
                      context,
                      onCompleted: () {
                        completedCalled = true;
                        Navigator.of(context, rootNavigator: true).pop();
                      },
                    );
                  },
                  child: const Text('Open'),
                ),
              ),
            ),
          ),
        ),
      ),
    );

    expect(DockVisibility.hideMiniPlayerNotifier.value, isFalse);

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();

    expect(DockVisibility.hideMiniPlayerNotifier.value, isTrue);
    expect(DockVisibility.hideNavDockNotifier.value, isTrue);
    expect(find.text('Welcome to Zenify'), findsOneWidget);

    // Fill Name and Age
    final textFields = find.byType(TextField);
    expect(textFields, findsNWidgets(2));
    await tester.enterText(textFields.at(0), 'Arjun');
    await tester.enterText(textFields.at(1), '24');
    await tester.pumpAndSettle();

    // Pick Gender via action sheet
    final genderFinder = find.text('Gender');
    await tester.ensureVisible(genderFinder);
    await tester.tap(genderFinder);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Male'));
    await tester.pumpAndSettle();

    // Step 1 -> Step 2 (Languages)
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Pick your languages'), findsOneWidget);

    await tester.tap(find.text('Tamil'));
    await tester.pumpAndSettle();

    // Step 2 -> Step 3 (Genres & Vibes)
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('What sounds move you?'), findsOneWidget);

    await tester.tap(find.text('Film Music'));
    await tester.tap(find.text('Indie'));
    await tester.pumpAndSettle();

    // Step 3 -> Step 4 (Artists)
    await tester.tap(find.text('Continue'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('Pick 3+ favorite artists'), findsOneWidget);

    for (final artistName in ['A.R. Rahman', 'Anirudh Ravichander', 'Sid Sriram']) {
      final finder = find.text(artistName);
      await tester.ensureVisible(finder);
      await tester.pumpAndSettle();
      await tester.tap(finder);
      await tester.pumpAndSettle();
    }

    await tester.tap(find.text('Start Listening'));
    await tester.pumpAndSettle();

    expect(completedCalled, isTrue);
    expect(UserPreferencesService.instance.hasCompleted, isTrue);
    expect(UserPreferencesService.instance.current?.displayName, 'Arjun');
    expect(UserPreferencesService.instance.current?.age, 24);
    expect(UserPreferencesService.instance.current?.gender, 'Male');
    expect(UserPreferencesService.instance.current?.languages, ['Tamil']);
    expect(UserPreferencesService.instance.current?.favoriteArtists.length, 3);
    expect(DockVisibility.hideMiniPlayerNotifier.value, isFalse);
  });

  testWidgets('Redesigned ProfileScreen, SettingsScreen, and InsightsScreen render cleanly',
      (tester) async {
    await UserPreferencesService.instance.save(
      const OnboardingPrefs(
        displayName: 'Karthik',
        age: 22,
        gender: 'Male',
        countryCode: 'IN',
        countryName: 'India',
        languages: ['Tamil'],
        genres: ['Film Music'],
        favoriteArtists: [
          OnboardingArtist(id: '1', name: 'A.R. Rahman'),
          OnboardingArtist(id: '2', name: 'Anirudh Ravichander'),
          OnboardingArtist(id: '3', name: 'Sid Sriram'),
        ],
        completed: true,
      ),
      syncRemote: false,
    );

    final auth = AuthState();
    final settings = SettingsState.instance;

    // 1. ProfileScreen
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthState>.value(value: auth),
          ChangeNotifierProvider<SettingsState>.value(value: settings),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Karthik'), findsWidgets);
    expect(find.text('Age'), findsOneWidget);
    expect(find.text('22'), findsOneWidget);
    expect(find.text('Male'), findsOneWidget);

    // 2. SettingsScreen
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthState>.value(value: auth),
          ChangeNotifierProvider<SettingsState>.value(value: settings),
        ],
        child: const MaterialApp(home: SettingsScreen()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Settings'), findsOneWidget);
    expect(find.text('Karthik'), findsOneWidget);

    // 3. InsightsScreen (guest state prompt)
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthState>.value(value: auth),
          ChangeNotifierProvider<PlayerState>(create: (_) => PlayerState()),
        ],
        child: const MaterialApp(home: InsightsScreen()),
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Replay'), findsOneWidget);
    expect(find.text('Sign In for Replay'), findsOneWidget);
  });

  testWidgets(
      'RoomTogetherScreen lobby populates onboarded username from UserPreferencesService',
      (tester) async {
    await UserPreferencesService.instance.save(
      const OnboardingPrefs(
        displayName: 'Karthik',
        completed: true,
      ),
      syncRemote: false,
    );

    final auth = AuthState();
    final player = PlayerState();
    final together = TogetherService.instance;

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<AuthState>.value(value: auth),
          ChangeNotifierProvider<PlayerState>.value(value: player),
          ChangeNotifierProvider<TogetherService>.value(value: together),
        ],
        child: const MaterialApp(home: RoomTogetherScreen()),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('Room Together'), findsOneWidget);
    expect(find.text('Karthik'), findsWidgets);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}
