import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/services/auth_state.dart';
import 'package:mobile/services/library_store.dart';
import 'package:mobile/services/player_state.dart';
import 'package:mobile/views/library/library_screen.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    LibraryStore.storage = MemoryLibraryStorage();
    await LibraryStore.instance.ensureLoaded();
  });

  testWidgets('LibraryScreen renders Favourite Songs with star icon and navigates cleanly', (tester) async {
    final playerState = PlayerState();
    final authState = AuthState();

    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<PlayerState>.value(value: playerState),
          ChangeNotifierProvider<AuthState>.value(value: authState),
        ],
        child: const MaterialApp(
          home: Scaffold(
            body: LibraryScreen(),
          ),
        ),
      ),
    );

    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    // Verify "Favourite Songs" category text exists
    expect(find.text('Favourite Songs'), findsAtLeastNWidgets(1));

    // Verify Star icon is rendered for Favourite Songs
    expect(find.byIcon(CupertinoIcons.star_fill), findsAtLeastNWidgets(1));

    // Verify "Downloaded" category exists
    expect(find.text('Downloaded'), findsOneWidget);
    expect(find.byIcon(CupertinoIcons.arrow_down_circle_fill), findsOneWidget);

    // Tap into Favourite Songs
    await tester.tap(find.text('Favourite Songs').first);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));

    // In Favourite Songs page: verify empty state title
    expect(find.text('No Favourite Songs Yet'), findsOneWidget);

    // Drain marquee timers
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 10));
  });
}
