import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:site_survey/main.dart' as app;

/// End to end against a real API (the Render demo by default), as the demo
/// salesperson. Creates one survey, checks it, edits it and deletes it, so
/// it leaves nothing behind.
///
/// `flutter test integration_test -d <simulator id>`
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('sign in, create, search, edit, delete a survey', (tester) async {
    final name = 'Mobile test ${DateTime.now().millisecondsSinceEpoch}';
    await app.main();
    await _settle(tester);

    // A session left by an earlier run: start from sign-in.
    if (find.byTooltip('Sign out').evaluate().isNotEmpty) {
      await tester.tap(find.byTooltip('Sign out'));
      await _waitFor(tester, find.text('Sign in'));
    }

    // The company code is a chip once remembered; type it only when asked.
    if (_field('Company code').evaluate().isNotEmpty) {
      await _type(tester, 'Company code', 'demo');
    }
    await _type(tester, 'Email', 'salesperson@demo.example.com');
    await _type(tester, 'Password', 'Demo!Passw0rd');
    await tester.tap(find.text('Sign in'));
    await _waitFor(tester, find.text('My site surveys'));

    await tester.tap(find.text('New survey'));
    await _settle(tester);
    await _type(tester, 'Project name *', name);
    await _type(tester, 'Address', 'Bole, Addis Ababa');
    await _type(tester, 'Contact telephone', '0911234567');
    await _type(tester, 'Shaft width', '2000');
    await _type(tester, 'Shaft depth', '1800');
    await _type(tester, 'Floors', 'B+G+11');
    await tester.tap(find.text('Submit survey'));
    await _waitFor(tester, find.text('My site surveys'));

    await tester.enterText(find.byType(SearchBar), name);
    // The search box holds the same text; the row is the Card.
    final row = find.widgetWithText(Card, name);
    await _waitFor(tester, row);
    await _settle(tester); // the search results replace the list mid-flight
    await tester.tap(row);
    await _waitFor(tester, find.byTooltip('Edit'));
    await _settle(tester);
    expect(find.text('2000 mm', findRichText: true), findsOneWidget);
    expect(find.text('B+G+11'), findsOneWidget);

    await tester.tap(find.byTooltip('Edit'));
    await _settle(tester);
    await _type(tester, 'Floors', 'G+5');
    await tester.tap(find.text('Save changes'));
    await _waitFor(tester, find.byTooltip('Edit'));
    await _settle(tester); // let the form's exit animation finish
    expect(find.text('G+5'), findsOneWidget);
    // The edit reads the survey back, so "collected by" is still filled.
    expect(find.text('Demo Salesperson'), findsOneWidget);

    await tester.tap(find.byTooltip('Delete'));
    await _settle(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await _waitFor(tester, find.text('My site surveys'));
    await _waitFor(tester, find.textContaining('No survey matches'));
  });
}

Finder _field(String label) => find.widgetWithText(TextFormField, label);

/// Scrolls the field into view first: the form is a lazy list.
Future<void> _type(WidgetTester tester, String label, String text) async {
  await tester.ensureVisible(_field(label));
  await _settle(tester);
  await tester.enterText(_field(label), text);
}

/// Pumps until [finder] shows up; the free Render tier can take a minute to wake.
Future<void> _waitFor(WidgetTester tester, Finder finder) async {
  for (var i = 0; i < 450; i++) {
    await tester.pump(const Duration(milliseconds: 200));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for $finder');
}

/// pumpAndSettle never returns on sign-in: the lift there loops for good.
/// A fixed second and a half covers every transition in the app.
Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 15; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}
