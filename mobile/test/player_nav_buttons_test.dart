import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design_system/widgets/apple_glass.dart';
import 'package:mobile/design_system/widgets/dynamic_island_header.dart';
import 'package:mobile/views/player/player_kit.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Full-View Player Buttons (Queue-Consistent Non-Glass Styling)', () {
    testWidgets('PopLikeButton renders circular non-glass button and toggles state', (tester) async {
      bool liked = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) {
                return Center(
                  child: PopLikeButton(
                    liked: liked,
                    onToggle: () {
                      setState(() => liked = !liked);
                    },
                  ),
                );
              },
            ),
          ),
        ),
      );

      // Verify NO AppleGlass is present
      expect(find.byType(AppleGlass), findsNothing);
      expect(find.byType(PopLikeButton), findsOneWidget);
      final iconFinder = find.byType(Icon);
      expect(iconFinder, findsOneWidget);
      final iconWidget = tester.widget<Icon>(iconFinder);
      expect(iconWidget.icon, equals(CupertinoIcons.heart));

      // Tap to like
      await tester.tap(find.byType(PopLikeButton));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));

      expect(liked, isTrue);
      expect(find.byIcon(CupertinoIcons.heart_fill), findsOneWidget);
      expect(find.byType(AppleGlass), findsNothing);
    });

    testWidgets('PlayerMoreButton renders circular non-glass button', (tester) async {
      bool tapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: PlayerMoreButton(
                onTap: () => tapped = true,
              ),
            ),
          ),
        ),
      );

      expect(find.byType(AppleGlass), findsNothing);
      expect(find.byType(PlayerMoreButton), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.ellipsis), findsOneWidget);

      await tester.tap(find.byType(PlayerMoreButton));
      await tester.pump();
      expect(tapped, isTrue);
    });
  });

  group('Dynamic Island Header Action Buttons (Glass-Applied)', () {
    testWidgets('DynamicIslandActionButton wraps icon in AppleGlass', (tester) async {
      bool tapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: DynamicIslandActionButton(
                icon: CupertinoIcons.ellipsis,
                onTap: () => tapped = true,
              ),
            ),
          ),
        ),
      );

      expect(find.byType(AppleGlass), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.ellipsis), findsOneWidget);

      await tester.tap(find.byType(DynamicIslandActionButton));
      await tester.pump();
      expect(tapped, isTrue);
    });

    testWidgets('DynamicIslandHeader onMore renders DynamicIslandActionButton', (tester) async {
      bool moreTapped = false;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DynamicIslandHeader(
              title: '',
              centerWidget: const SizedBox(),
              showBack: true,
              showProfile: false,
              onMore: () => moreTapped = true,
            ),
          ),
        ),
      );

      expect(find.byType(DynamicIslandActionButton), findsOneWidget);
      expect(find.byIcon(CupertinoIcons.ellipsis), findsOneWidget);

      await tester.tap(find.byType(DynamicIslandActionButton));
      await tester.pump();
      expect(moreTapped, isTrue);
    });
  });
}
