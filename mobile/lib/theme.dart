import 'package:flutter/material.dart';

/// The logo's own burnt orange. Used sparingly: one accent per screen.
const accent = Color(0xFFD06A22);

/// Near-black with a little warmth, so it sits on the paper background.
const ink = Color(0xFF1A1712);

/// Measurements and dates: figures line up and read as numbers.
const mono = TextStyle(fontFamily: 'IBMPlexMono', fontWeight: FontWeight.w500);

ThemeData buildTheme(Brightness brightness) {
  final light = brightness == Brightness.light;
  final scheme = ColorScheme(
    brightness: brightness,
    primary: light ? ink : const Color(0xFFF3EEE6),
    onPrimary: light ? Colors.white : ink,
    secondary: accent,
    onSecondary: Colors.white,
    error: light ? const Color(0xFFB3261E) : const Color(0xFFF2B8B5),
    onError: light ? Colors.white : const Color(0xFF601410),
    surface: light ? const Color(0xFFF5F2EC) : const Color(0xFF14120F),
    onSurface: light ? ink : const Color(0xFFF3EEE6),
    onSurfaceVariant: light ? const Color(0xFF6B645A) : const Color(0xFFA39B8F),
    surfaceContainerLowest: light ? Colors.white : const Color(0xFF1D1A16),
    surfaceContainerHighest: light
        ? const Color(0xFFEBE6DC)
        : const Color(0xFF2A261F),
    outline: light ? const Color(0xFFB9B1A4) : const Color(0xFF5A544B),
    outlineVariant: light ? const Color(0xFFE2DCD1) : const Color(0xFF34302A),
  );
  final radius12 = BorderRadius.circular(12);
  final base = ThemeData(
    colorScheme: scheme,
    fontFamily: 'Archivo',
    scaffoldBackgroundColor: scheme.surface,
  );
  final text = base.textTheme;
  return base.copyWith(
    textTheme: text.copyWith(
      headlineLarge: text.headlineLarge?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -1.2,
        height: 1.05,
      ),
      headlineMedium: text.headlineMedium?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: -0.8,
        height: 1.1,
      ),
      titleLarge: text.titleLarge?.copyWith(fontWeight: FontWeight.w700),
      titleMedium: text.titleMedium?.copyWith(fontWeight: FontWeight.w600),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      foregroundColor: scheme.onSurface,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: scheme.surfaceContainerHighest,
      contentPadding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      // Underline borders keep the floating label inside the fill; an
      // outline border would set it on the edge.
      border: UnderlineInputBorder(
        borderRadius: radius12,
        borderSide: BorderSide.none,
      ),
      enabledBorder: UnderlineInputBorder(
        borderRadius: radius12,
        borderSide: BorderSide.none,
      ),
      focusedBorder: UnderlineInputBorder(
        borderRadius: radius12,
        borderSide: BorderSide(color: scheme.onSurface, width: 2),
      ),
      errorBorder: UnderlineInputBorder(
        borderRadius: radius12,
        borderSide: BorderSide(color: scheme.error),
      ),
      focusedErrorBorder: UnderlineInputBorder(
        borderRadius: radius12,
        borderSide: BorderSide(color: scheme.error, width: 2),
      ),
      labelStyle: TextStyle(color: scheme.onSurfaceVariant),
      floatingLabelStyle: TextStyle(color: scheme.onSurface),
      suffixStyle: mono.copyWith(color: scheme.onSurfaceVariant),
      errorMaxLines: 2,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(56),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        textStyle: const TextStyle(
          fontFamily: 'Archivo',
          fontSize: 16,
          fontWeight: FontWeight.w600,
        ),
      ),
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      backgroundColor: scheme.primary,
      foregroundColor: scheme.onPrimary,
      elevation: 2,
      highlightElevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      extendedTextStyle: const TextStyle(
        fontFamily: 'Archivo',
        fontSize: 15,
        fontWeight: FontWeight.w600,
      ),
    ),
    cardTheme: CardThemeData(
      color: scheme.surfaceContainerLowest,
      elevation: 0,
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outlineVariant),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: scheme.surfaceContainerHighest,
      selectedColor: scheme.primary,
      secondarySelectedColor: scheme.primary,
      labelStyle: TextStyle(color: scheme.onSurface),
      secondaryLabelStyle: TextStyle(color: scheme.onPrimary),
      checkmarkColor: scheme.onPrimary,
      side: BorderSide.none,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
    ),
    dividerTheme: DividerThemeData(color: scheme.outlineVariant, space: 1),
    dialogTheme: DialogThemeData(
      backgroundColor: scheme.surfaceContainerLowest,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: radius12),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.onSurface),
    // Android's newer fade-and-slide; iOS keeps its own swipe-back slide.
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      },
    ),
  );
}

/// A small mono caption in capitals, the way a drawing labels its parts.
class Eyebrow extends StatelessWidget {
  const Eyebrow(this.text, {super.key, this.color, this.rule = false});

  final String text;
  final Color? color;

  /// Draws a hairline after the label, to open a section.
  final bool rule;

  @override
  Widget build(BuildContext context) {
    final label = Text(
      text.toUpperCase(),
      style: mono.copyWith(
        fontSize: 11,
        letterSpacing: 1.4,
        color: color ?? Theme.of(context).colorScheme.onSurfaceVariant,
      ),
    );
    if (!rule) return label;
    return Semantics(
      header: true,
      child: Row(
        children: [
          label,
          const SizedBox(width: 12),
          const Expanded(child: Divider()),
        ],
      ),
    );
  }
}
