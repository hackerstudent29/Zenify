import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/design_system/widgets/marquee_text.dart';

void main() {
  testWidgets('MarqueeText renders and displays full title correctly', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SizedBox(
            width: 100,
            child: MarqueeText(
              'A very long title that exceeds boundary and scrolls',
              style: TextStyle(fontSize: 14),
            ),
          ),
        ),
      ),
    );

    expect(find.byType(MarqueeText), findsOneWidget);
    expect(find.text('A very long title that exceeds boundary and scrolls'), findsWidgets);
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(MarqueeText), findsOneWidget);
  });
}
