import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'screens/login_screen.dart';
import 'screens/survey_list_screen.dart';
import 'theme.dart';

final navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  // The password and tokens must never travel in cleartext from a real build.
  if (kReleaseMode && !apiUrl.startsWith('https://')) {
    throw StateError('Release builds need an https API_URL, got $apiUrl');
  }
  WidgetsFlutterBinding.ensureInitialized();
  // The bundled fonts' OFL must travel with them; it shows on the licence page.
  LicenseRegistry.addLicense(() async* {
    for (final font in ['Archivo', 'IBMPlexMono']) {
      final text = await rootBundle.loadString('assets/fonts/OFL-$font.txt');
      yield LicenseEntryWithLineBreaks([font], text);
    }
  });
  final signedIn = await api.restore();
  api.onSignedOut = () => navigatorKey.currentState?.pushAndRemoveUntil(
    MaterialPageRoute<void>(builder: (_) => const LoginScreen()),
    (_) => false,
  );
  runApp(SiteSurveyApp(signedIn: signedIn));
}

class SiteSurveyApp extends StatelessWidget {
  const SiteSurveyApp({super.key, required this.signedIn});

  final bool signedIn;

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Shining Star Sales',
    navigatorKey: navigatorKey,
    debugShowCheckedModeBanner: false,
    theme: buildTheme(Brightness.light),
    darkTheme: buildTheme(Brightness.dark),
    home: signedIn ? const SurveyListScreen() : const LoginScreen(),
  );
}
