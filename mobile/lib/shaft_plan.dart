import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'theme.dart';

/// The shaft in plan, drawn to the measured proportions: walls, the door
/// opening on the front wall, the car, and (unless [compact]) dimension
/// lines for width and depth. Decorative: the figures are always shown as
/// text beside it.
class ShaftPlan extends StatelessWidget {
  const ShaftPlan({
    super.key,
    required this.width,
    required this.depth,
    required this.line,
    required this.background,
    this.compact = false,
  });

  final int? width;
  final int? depth;

  /// Walls and labels.
  final Color line;

  /// What the drawing sits on, so labels can cut the dimension lines.
  final Color background;

  /// A thumbnail: no dimension lines, thinner walls.
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final w = width;
    final d = depth;
    return ExcludeSemantics(
      child: CustomPaint(
        size: Size.infinite,
        painter: _ShaftPainter(
          // Unmeasured sides draw square; extreme ratios stay legible.
          ratio: w != null && d != null ? (w / d).clamp(0.5, 2.0) : 1.0,
          width: w == null ? 'W ?' : '$w',
          depth: d == null ? 'D ?' : '$d',
          measured: w != null && d != null,
          line: line,
          background: background,
          compact: compact,
        ),
      ),
    );
  }
}

class _ShaftPainter extends CustomPainter {
  _ShaftPainter({
    required this.ratio,
    required this.width,
    required this.depth,
    required this.measured,
    required this.line,
    required this.background,
    required this.compact,
  });

  final double ratio;
  final String width;
  final String depth;
  final bool measured;
  final Color line;
  final Color background;
  final bool compact;

  @override
  void paint(Canvas canvas, Size size) {
    // Room on the left and below for the dimension lines.
    final gutter = compact ? 2.0 : 34.0;
    final maxW = size.width - gutter * 2;
    final maxH = size.height - (compact ? gutter * 2 : gutter);
    final h = math.min(maxH, maxW / ratio);
    final w = h * ratio;
    final shaft = Rect.fromLTWH(
      gutter + (maxW - w) / 2,
      compact ? (size.height - h) / 2 : 0,
      w,
      h,
    );
    final faint = line.withValues(alpha: 0.35);

    canvas.drawRect(shaft, Paint()..color = line.withValues(alpha: 0.06));

    final wall = Paint()
      ..color = measured ? line : faint
      ..strokeWidth = compact ? 2.5 : 4
      ..style = PaintingStyle.stroke;
    // Front wall with the landing door opening in the middle.
    final door = w * 0.4;
    canvas.drawPath(
      Path()
        ..moveTo(shaft.center.dx - door / 2, shaft.bottom)
        ..lineTo(shaft.left, shaft.bottom)
        ..lineTo(shaft.left, shaft.top)
        ..lineTo(shaft.right, shaft.top)
        ..lineTo(shaft.right, shaft.bottom)
        ..lineTo(shaft.center.dx + door / 2, shaft.bottom),
      wall,
    );

    // The car, and its door sill.
    canvas.drawRect(
      shaft.deflate(math.min(w, h) * 0.16),
      Paint()
        ..color = faint
        ..strokeWidth = compact ? 1 : 1.2
        ..style = PaintingStyle.stroke,
    );
    canvas.drawLine(
      Offset(shaft.center.dx - door / 2, shaft.bottom),
      Offset(shaft.center.dx + door / 2, shaft.bottom),
      Paint()
        ..color = accent
        ..strokeWidth = compact ? 2 : 2.5,
    );
    if (compact) return;

    final dim = Paint()
      ..color = faint
      ..strokeWidth = 1;
    // Width, below.
    final y = shaft.bottom + 16;
    canvas.drawLine(Offset(shaft.left, y), Offset(shaft.right, y), dim);
    for (final x in [shaft.left, shaft.right]) {
      canvas.drawLine(Offset(x, y - 5), Offset(x, y + 5), dim);
    }
    _label(canvas, width, Offset(shaft.center.dx, y));
    // Depth, left.
    final x = shaft.left - 16;
    canvas.drawLine(Offset(x, shaft.top), Offset(x, shaft.bottom), dim);
    for (final yy in [shaft.top, shaft.bottom]) {
      canvas.drawLine(Offset(x - 5, yy), Offset(x + 5, yy), dim);
    }
    canvas.save();
    canvas.translate(x, shaft.center.dy);
    canvas.rotate(-math.pi / 2);
    _label(canvas, depth, Offset.zero);
    canvas.restore();
  }

  /// Centered on [at], on a background pad that breaks the line.
  void _label(Canvas canvas, String text, Offset at) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: mono.copyWith(fontSize: 12, color: line),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    canvas.drawRect(
      Rect.fromCenter(center: at, width: tp.width + 10, height: tp.height + 2),
      Paint()..color = background,
    );
    tp.paint(canvas, at - Offset(tp.width / 2, tp.height / 2));
  }

  @override
  bool shouldRepaint(_ShaftPainter old) =>
      old.ratio != ratio ||
      old.width != width ||
      old.depth != depth ||
      old.line != line ||
      old.background != background;
}
