import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../api.dart';
import '../theme.dart';
import 'survey_list_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _tenant = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _hidePassword = true;
  bool _busy = false;

  /// The company code is asked once; after that it is a one-line chip.
  bool _editCompany = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    api.lastLogin().then((last) {
      if (!mounted) return;
      setState(() {
        _tenant.text = last.$1;
        _email.text = last.$2;
        if (isDemo) {
          if (_tenant.text.isEmpty) _tenant.text = 'demo';
          if (_email.text.isEmpty) {
            _email.text = 'salesperson@demo.example.com';
          }
          _password.text = 'Demo!Passw0rd';
        }
      });
    });
  }

  @override
  void dispose() {
    _tenant.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await api.login(
        _tenant.text.trim().toLowerCase(),
        _email.text.trim(),
        _password.text,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute<void>(builder: (_) => const SurveyListScreen()),
      );
    } on ApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final askCompany = _editCompany || _tenant.text.trim().isEmpty;
    return Scaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverFillRemaining(
              hasScrollBody: false,
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                    child: Form(
                      key: _form,
                      child: AutofillGroup(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              children: [
                                ClipRRect(
                                  borderRadius: BorderRadius.circular(10),
                                  child: Image.asset(
                                    'assets/icon.png',
                                    width: 36,
                                    height: 36,
                                    semanticLabel: 'Shining Star logo',
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Text(
                                  'Shining Star',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    letterSpacing: -0.3,
                                  ),
                                ),
                                const Spacer(),
                                const Eyebrow('Sales'),
                              ],
                            ),
                            const SizedBox(height: 20),
                            const _Hero(),
                            const Spacer(),
                            const SizedBox(height: 28),
                            Text(
                              'Welcome back',
                              style: theme.textTheme.headlineMedium?.copyWith(
                                fontSize: 26,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              "Sign in to log today's site visits.",
                              style: TextStyle(color: scheme.onSurfaceVariant),
                            ),
                            const SizedBox(height: 20),
                            AnimatedSize(
                              duration: const Duration(milliseconds: 200),
                              alignment: Alignment.topCenter,
                              child: askCompany
                                  ? Padding(
                                      padding: const EdgeInsets.only(
                                        bottom: 12,
                                      ),
                                      child: TextFormField(
                                        controller: _tenant,
                                        autofocus: _editCompany,
                                        decoration: const InputDecoration(
                                          labelText: 'Company code',
                                          prefixIcon: Icon(
                                            Icons.apartment_outlined,
                                          ),
                                        ),
                                        autocorrect: false,
                                        textInputAction: TextInputAction.next,
                                        validator: _required,
                                      ),
                                    )
                                  : _companyChip(scheme),
                            ),
                            TextFormField(
                              controller: _email,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                prefixIcon: Icon(Icons.mail_outline),
                              ),
                              keyboardType: TextInputType.emailAddress,
                              autofillHints: const [
                                AutofillHints.email,
                                AutofillHints.username,
                              ],
                              autocorrect: false,
                              textInputAction: TextInputAction.next,
                              validator: _required,
                            ),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _password,
                              decoration: InputDecoration(
                                labelText: 'Password',
                                prefixIcon: const Icon(Icons.lock_outline),
                                suffixIcon: IconButton(
                                  tooltip: _hidePassword
                                      ? 'Show password'
                                      : 'Hide password',
                                  icon: Icon(
                                    _hidePassword
                                        ? Icons.visibility_outlined
                                        : Icons.visibility_off_outlined,
                                  ),
                                  onPressed: () => setState(
                                    () => _hidePassword = !_hidePassword,
                                  ),
                                ),
                              ),
                              obscureText: _hidePassword,
                              autofillHints: const [AutofillHints.password],
                              textInputAction: TextInputAction.done,
                              onFieldSubmitted: (_) => _submit(),
                              validator: _required,
                            ),
                            if (_error != null) ...[
                              const SizedBox(height: 14),
                              Semantics(
                                liveRegion: true,
                                child: Text(
                                  _error!,
                                  style: TextStyle(color: scheme.error),
                                ),
                              ),
                            ],
                            const SizedBox(height: 20),
                            FilledButton(
                              onPressed: _busy ? null : _submit,
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text(_busy ? 'Signing in…' : 'Sign in'),
                                  const SizedBox(width: 10),
                                  _busy
                                      ? SizedBox.square(
                                          dimension: 16,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                            color: scheme.onSurfaceVariant,
                                          ),
                                        )
                                      : const Icon(
                                          Icons.arrow_forward,
                                          size: 20,
                                          color: accent,
                                        ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _companyChip(ColorScheme scheme) => Padding(
    padding: const EdgeInsets.only(bottom: 12),
    child: Container(
      padding: const EdgeInsets.fromLTRB(14, 4, 4, 4),
      decoration: BoxDecoration(
        border: Border.all(color: scheme.outlineVariant),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
            Icons.apartment_outlined,
            size: 20,
            color: scheme.onSurfaceVariant,
          ),
          const SizedBox(width: 10),
          Text('Company', style: TextStyle(color: scheme.onSurfaceVariant)),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _tenant.text.trim(),
              overflow: TextOverflow.ellipsis,
              style: mono.copyWith(fontSize: 15),
            ),
          ),
          TextButton(
            onPressed: () => setState(() => _editCompany = true),
            child: const Text('Change'),
          ),
        ],
      ),
    ),
  );
}

String? _required(String? value) =>
    (value ?? '').trim().isEmpty ? 'Required' : null;

/// The dark banner: a three-beat line and a lift riding its shaft.
class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    final headline = Theme.of(
      context,
    ).textTheme.headlineLarge?.copyWith(color: Colors.white, fontSize: 34);
    return Container(
      height: 260,
      padding: const EdgeInsets.fromLTRB(24, 24, 16, 24),
      decoration: BoxDecoration(
        color: ink,
        borderRadius: BorderRadius.circular(28),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Eyebrow('Site surveys', color: accent),
                const Spacer(),
                Text.rich(
                  TextSpan(
                    children: [
                      const TextSpan(text: 'Measure it.\nLog it.\n'),
                      TextSpan(
                        text: 'Sell it.',
                        style: headline?.copyWith(color: accent),
                      ),
                    ],
                  ),
                  style: headline,
                ),
              ],
            ),
          ),
          const SizedBox(width: 72, child: _Lift()),
        ],
      ),
    );
  }
}

/// A lift car riding between floors, pausing at each like the real thing,
/// with a floor display on top. Holds still when the system asks for less
/// motion.
class _Lift extends StatefulWidget {
  const _Lift();

  @override
  State<_Lift> createState() => _LiftState();
}

/// The floors the car visits, in order; 0 is the ground floor.
const _stops = [0, 4, 2, 5, 1, 3];
const _floors = 6;

class _LiftState extends State<_Lift> with SingleTickerProviderStateMixin {
  late final _ride = AnimationController(
    vsync: this,
    duration: const Duration(seconds: 14),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.disableAnimationsOf(context)) {
      _ride.stop();
    } else if (!_ride.isAnimating) {
      _ride.repeat();
    }
  }

  @override
  void dispose() {
    _ride.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
    child: AnimatedBuilder(
      animation: _ride,
      builder: (context, _) {
        // Each leg: wait at the floor for a third, then travel.
        final legs = _stops.length;
        final t = _ride.value * legs;
        final leg = t.floor() % legs;
        final local = t - t.floor();
        final from = _stops[leg];
        final to = _stops[(leg + 1) % legs];
        final move = Curves.easeInOutCubic.transform(
          ((local - 0.35) / 0.65).clamp(0.0, 1.0),
        );
        final floor = from + (to - from) * move;
        final moving = move > 0 && move < 1;
        return Column(
          children: [
            _Display(
              floor: floor.round(),
              direction: moving ? (to > from ? 1 : -1) : 0,
            ),
            const SizedBox(height: 10),
            Expanded(
              child: CustomPaint(
                painter: _ShaftPainter(floor),
                size: Size.infinite,
              ),
            ),
          ],
        );
      },
    ),
  );
}

class _Display extends StatelessWidget {
  const _Display({required this.floor, required this.direction});

  final int floor;

  /// 1 up, -1 down, 0 standing.
  final int direction;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: Colors.black,
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: Colors.white12),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          direction > 0
              ? Icons.arrow_drop_up
              : direction < 0
              ? Icons.arrow_drop_down
              : Icons.remove,
          size: 16,
          color: direction == 0 ? Colors.white30 : accent,
        ),
        Text(
          floor == 0 ? ' G' : floor.toString().padLeft(2),
          style: mono.copyWith(color: accent, fontSize: 15),
        ),
      ],
    ),
  );
}

class _ShaftPainter extends CustomPainter {
  _ShaftPainter(this.floor);

  /// Where the car is, in floors from the ground; fractional while moving.
  final double floor;

  @override
  void paint(Canvas canvas, Size size) {
    final storey = size.height / _floors;
    final rail = Paint()
      ..color = Colors.white24
      ..strokeWidth = 1.5;
    final carW = math.min(size.width * 0.45, 30.0);
    final left = (size.width - carW) / 2 - 6;
    final right = (size.width + carW) / 2 + 6;

    // Guide rails, and a landing mark at every floor.
    canvas.drawLine(Offset(left, 0), Offset(left, size.height), rail);
    canvas.drawLine(Offset(right, 0), Offset(right, size.height), rail);
    final slab = Paint()
      ..color = Colors.white12
      ..strokeWidth = 1;
    for (var i = 0; i <= _floors; i++) {
      final y = size.height - i * storey;
      canvas.drawLine(Offset(0, y), Offset(left - 4, y), slab);
      canvas.drawLine(Offset(right + 4, y), Offset(size.width, y), slab);
    }

    // The car: hung from its ropes, doors split down the middle.
    final carH = storey * 0.86;
    final top = size.height - (floor + 1) * storey + (storey - carH);
    final car = RRect.fromRectAndRadius(
      Rect.fromLTWH((size.width - carW) / 2, top, carW, carH),
      const Radius.circular(4),
    );
    canvas.drawLine(
      Offset(size.width / 2, 0),
      Offset(size.width / 2, top),
      Paint()
        ..color = Colors.white30
        ..strokeWidth = 1,
    );
    canvas.drawRRect(car, Paint()..color = accent);
    canvas.drawLine(
      Offset(size.width / 2, top + 4),
      Offset(size.width / 2, top + carH - 4),
      Paint()
        ..color = ink.withValues(alpha: 0.5)
        ..strokeWidth = 1.2,
    );
  }

  @override
  bool shouldRepaint(_ShaftPainter old) => old.floor != floor;
}
