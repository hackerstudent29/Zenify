import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:mobile/design_system/widgets/artwork_mesh_background.dart';
import 'package:mobile/services/auth_state.dart';
import 'package:mobile/services/dock_visibility.dart';
import 'package:mobile/services/user_preferences_service.dart';
import 'package:mobile/views/auth/onboarding_sheet.dart';
import 'package:mobile/views/auth/welcome_screen.dart';
import 'package:mobile/views/splash/zenify_splash_screen.dart';

class _TestAuthState extends AuthState {
  bool guestTapped = false;

  @override
  Future<void> continueAsGuest() async {
    guestTapped = true;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test(
      'AuthState shows Sign-In on launch, loops every 3 days for guests, and never for signed-in users',
      () async {
    final fresh = AuthState();
    await fresh.ensureLoaded();
    expect(fresh.shouldShowSignInPromptOnLaunch, isTrue);

    // Continue as Guest -> allowed straight in for < 3 days
    await fresh.continueAsGuest();
    expect(fresh.isGuest, isTrue);
    expect(fresh.isLoggedIn, isFalse);

    final acceptedAt =
        DateTime.fromMillisecondsSinceEpoch(fresh.lastGuestAcceptedAtMs!);
    expect(
      fresh.shouldShowSignInPromptAt(
        acceptedAt.add(const Duration(days: 2, hours: 23)),
      ),
      isFalse,
    );

    // After 3 days -> re-prompts Sign In
    expect(
      fresh.shouldShowSignInPromptAt(
        acceptedAt.add(const Duration(days: 3)),
      ),
      isTrue,
    );

    // Persisted across app restarts: still skips before 3 days, prompts at >= 3 days
    final restarted = AuthState();
    await restarted.ensureLoaded();
    expect(
      restarted.shouldShowSignInPromptAt(
        acceptedAt.add(const Duration(hours: 12)),
      ),
      isFalse,
    );
    expect(
      restarted.shouldShowSignInPromptAt(
        acceptedAt.add(const Duration(days: 4)),
      ),
      isTrue,
    );

    // Sign in permanently suppresses the Sign-In prompt forever
    await restarted.signIn('user@zenify.music', 'secret');
    expect(restarted.isLoggedIn, isTrue);
    expect(
      restarted.shouldShowSignInPromptAt(
        acceptedAt.add(const Duration(days: 365)),
      ),
      isFalse,
    );
  });

  testWidgets(
      'WelcomeScreen renders transparent looping ZenifyAnimatedLogo, Rose-White ArtworkMeshBackground, and sequences CTA buttons',
      (tester) async {
    late _TestAuthState auth;
    await tester.runAsync(() async {
      await UserPreferencesService.instance.clearLocal();
      auth = _TestAuthState();
      await auth.ensureLoaded();
    });
    var finished = false;

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>.value(
        value: auth,
        child: MaterialApp(
          home: WelcomeScreen(
            onFinished: () => finished = true,
          ),
        ),
      ),
    );

    // Renders ArtworkMeshBackground and looping transparent ZenifyAnimatedLogo
    expect(find.byType(ArtworkMeshBackground), findsOneWidget);
    expect(find.byType(ZenifyAnimatedLogo), findsOneWidget);
    final logoWidget =
        tester.widget<ZenifyAnimatedLogo>(find.byType(ZenifyAnimatedLogo));
    expect(logoWidget.loop, isTrue);
    expect(DockVisibility.hideMiniPlayerNotifier.value, isTrue);

    // Advance past intro settle & staggered button entrance
    await tester.pump(const Duration(milliseconds: 1450));
    await tester.pump(const Duration(milliseconds: 1050));

    expect(find.text('Music. Elevated to Studio Fidelity.'), findsOneWidget);
    expect(find.text('Continue with Google'), findsOneWidget);
    expect(find.text('Continue with Email'), findsOneWidget);
    expect(find.text('Continue as Guest'), findsOneWidget);

    await tester.ensureVisible(find.text('Continue as Guest'));
    await tester.tap(find.text('Continue as Guest'));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 350));

    expect(auth.guestTapped, isTrue);
    expect(finished, isFalse);
    expect(find.byType(OnboardingSheet), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });

  testWidgets(
      'WelcomeScreen skips OnboardingSheet on Guest when onboarding was already completed',
      (tester) async {
    late _TestAuthState auth;
    await tester.runAsync(() async {
      auth = _TestAuthState();
      await auth.ensureLoaded();
      await UserPreferencesService.instance.save(
        const OnboardingPrefs(
          completed: true,
          displayName: 'Arjun',
          countryCode: 'IN',
          countryName: 'India',
          languages: ['Tamil'],
          genres: ['Film Music'],
        ),
        syncRemote: false,
      );
    });
    var finished = false;

    await tester.pumpWidget(
      ChangeNotifierProvider<AuthState>.value(
        value: auth,
        child: MaterialApp(
          home: WelcomeScreen(
            onFinished: () => finished = true,
          ),
        ),
      ),
    );

    await tester.pump(const Duration(milliseconds: 1450));
    await tester.pump(const Duration(milliseconds: 1050));

    await tester.ensureVisible(find.text('Continue as Guest'));
    await tester.tap(find.text('Continue as Guest'));
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(auth.guestTapped, isTrue);
    expect(finished, isTrue);

    await tester.runAsync(() => UserPreferencesService.instance.clearLocal());
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
  });
}
