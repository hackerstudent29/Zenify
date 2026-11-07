import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/main.dart';

void main() {
  testWidgets('Zenify Mobile smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const ZenifyMobileApp());
    expect(find.byType(ZenifyMobileApp), findsOneWidget);
  });
}
