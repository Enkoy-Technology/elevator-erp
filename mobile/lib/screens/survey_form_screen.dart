import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../survey.dart';
import '../theme.dart';

/// New survey, or edit [survey]. Only the project name is required: a
/// salesperson in a stairwell fills what they could measure. Pops `true`
/// after a create, or the updated [Survey] after an edit.
class SurveyFormScreen extends StatefulWidget {
  const SurveyFormScreen({super.key, this.survey});

  final Survey? survey;

  @override
  State<SurveyFormScreen> createState() => _SurveyFormScreenState();
}

class _SurveyFormScreenState extends State<SurveyFormScreen> {
  final _form = GlobalKey<FormState>();
  late final Survey? _s = widget.survey;
  late final _date = TextEditingController(text: _s?.surveyDate ?? _today());
  late final _projectName = TextEditingController(text: _s?.projectName);
  late final _address = TextEditingController(text: _s?.address);
  late final _contactName = TextEditingController(text: _s?.contactName);
  late final _contactPhone = TextEditingController(text: _s?.contactPhone);
  late final _shaftWidth = TextEditingController(
    text: _s?.shaftWidthMm?.toString(),
  );
  late final _shaftDepth = TextEditingController(
    text: _s?.shaftDepthMm?.toString(),
  );
  late final _floors = TextEditingController(text: _s?.floors);
  late final _overhead = TextEditingController(
    text: _s?.overheadMm?.toString(),
  );
  late final _units = TextEditingController(text: _s?.units);
  late final _capacity = TextEditingController(
    text: _s?.capacityKg?.toString(),
  );
  late String _machineRoom = _s?.machineRoom ?? '';
  late String? _productType = _s?.productType;
  List<Product>? _products;
  bool _dirty = false;
  bool _saving = false;
  String? _error;

  late final _controllers = [
    _date,
    _projectName,
    _address,
    _contactName,
    _contactPhone,
    _shaftWidth,
    _shaftDepth,
    _floors,
    _overhead,
    _units,
    _capacity,
  ];

  @override
  void initState() {
    super.initState();
    // The list is the company's own; without it the section says so and the
    // rest of the sheet still saves.
    api.listProducts().then(
      (rows) => mounted ? setState(() => _products = rows) : null,
      onError: (_) => mounted ? setState(() => _products = const []) : null,
    );
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _pickDate() async {
    final first = DateTime(2000);
    final last = DateTime.now().add(const Duration(days: 365));
    // An imported sheet can carry any date; the picker asserts it is in range.
    final current = DateTime.tryParse(_date.text) ?? DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: current.isBefore(first)
          ? first
          : current.isAfter(last)
          ? last
          : current,
      firstDate: first,
      lastDate: last,
    );
    if (picked != null) {
      _date.text = _isoDate(picked);
      _dirty = true;
    }
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    // Blank means "not measured", so it goes up as null, never as '' or 0.
    final fields = <String, Object?>{
      'surveyDate': _date.text,
      'projectName': _projectName.text.trim(),
      'address': _text(_address),
      'contactName': _text(_contactName),
      'contactPhone': _text(_contactPhone),
      'shaftWidthMm': _mm(_shaftWidth),
      'shaftDepthMm': _mm(_shaftDepth),
      'floors': _text(_floors),
      'overheadMm': _mm(_overhead),
      'machineRoom': _machineRoom.isEmpty ? null : _machineRoom,
      'units': _text(_units),
      'productType': _productType,
      'capacityKg': _hasLoad ? int.tryParse(_capacity.text) : null,
    };
    try {
      final s = _s;
      if (s == null) {
        await api.createSurvey(fields);
        if (mounted) Navigator.of(context).pop(true);
      } else {
        final updated = await api.updateSurvey(s.id, fields);
        if (mounted) Navigator.of(context).pop(updated);
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _saving = false;
          _error = e.message;
        });
      }
    }
  }

  /// Leaving with unsaved measurements asks first; a mis-tap on Back in the
  /// field should not lose a whole sheet.
  Future<void> _confirmLeave() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Discard this survey?'),
        content: const Text('What you typed here will be lost.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Keep editing'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Discard'),
          ),
        ],
      ),
    );
    if (leave == true && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final editing = _s != null;
    final scheme = Theme.of(context).colorScheme;
    // An imported sheet can hold words neither option offers; keep them
    // selectable so saving never rewrites them away.
    final machineRooms = {
      'With MR',
      'MRL',
      if (_machineRoom.isNotEmpty) _machineRoom,
    };
    return PopScope(
      // Back is always intercepted; a save pops through Navigator.pop, which
      // PopScope does not block.
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        // Leaving mid-save would drop the server's answer on the floor.
        if (didPop || _saving) return;
        _dirty ? _confirmLeave() : Navigator.of(context).pop();
      },
      child: Scaffold(
        appBar: AppBar(title: Text(editing ? 'Edit survey' : 'New survey')),
        body: Form(
          key: _form,
          onChanged: () => _dirty = true,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
            children: [
              _group('Site', [
                TextFormField(
                  controller: _date,
                  decoration: const InputDecoration(
                    labelText: 'Date',
                    suffixIcon: Icon(Icons.calendar_today_outlined),
                  ),
                  style: mono,
                  readOnly: true,
                  onTap: _pickDate,
                ),
                _gap,
                TextFormField(
                  controller: _projectName,
                  decoration: const InputDecoration(
                    labelText: 'Project name *',
                  ),
                  textCapitalization: TextCapitalization.words,
                  textInputAction: TextInputAction.next,
                  inputFormatters: [LengthLimitingTextInputFormatter(200)],
                  validator: (v) => (v ?? '').trim().isEmpty
                      ? 'Enter the project name'
                      : null,
                ),
                _gap,
                _textField(_address, 'Address', maxLength: 300),
              ]),
              _group('Contact', [
                _textField(
                  _contactName,
                  'Contact person',
                  maxLength: 200,
                  words: true,
                ),
                _gap,
                TextFormField(
                  controller: _contactPhone,
                  decoration: const InputDecoration(
                    labelText: 'Contact telephone',
                    hintText: '0911234567',
                  ),
                  style: mono,
                  keyboardType: TextInputType.phone,
                  autofillHints: const [AutofillHints.telephoneNumber],
                  textInputAction: TextInputAction.next,
                ),
              ]),
              _group('Lift', _liftFields(scheme)),
              _group('Shaft', [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: _mmField(_shaftWidth, 'Shaft width')),
                    const SizedBox(width: 12),
                    Expanded(child: _mmField(_shaftDepth, 'Shaft depth')),
                  ],
                ),
                _gap,
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: _textField(
                        _floors,
                        'Floors',
                        hint: 'B+G+11',
                        maxLength: 100,
                        figures: true,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(child: _mmField(_overhead, 'OH')),
                  ],
                ),
                const SizedBox(height: 20),
                Text(
                  'Machine room',
                  style: TextStyle(color: scheme.onSurfaceVariant),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  children: [
                    for (final option in machineRooms)
                      ChoiceChip(
                        label: Text(option),
                        selected: _machineRoom == option,
                        // Tapping the chosen one again clears it.
                        onSelected: (on) => setState(() {
                          _machineRoom = on ? option : '';
                          _dirty = true;
                        }),
                      ),
                  ],
                ),
                const SizedBox(height: 20),
                _textField(
                  _units,
                  'Units',
                  hint: 'A number or a word',
                  maxLength: 60,
                ),
              ]),
            ],
          ),
        ),
        bottomNavigationBar: DecoratedBox(
          decoration: BoxDecoration(
            color: scheme.surface,
            border: Border(top: BorderSide(color: scheme.outlineVariant)),
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Next to the button, so it is seen however far down the
                  // form the salesperson has scrolled.
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Semantics(
                        liveRegion: true,
                        child: Text(
                          _error!,
                          style: TextStyle(color: scheme.error),
                        ),
                      ),
                    ),
                  FilledButton(
                    onPressed: _saving ? null : _save,
                    child: Text(
                      _saving
                          ? 'Saving…'
                          : editing
                          ? 'Save changes'
                          : 'Submit survey',
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Product? get _product =>
      _products?.where((p) => p.code == _productType).firstOrNull;

  /// The escalator has no rated load; nothing picked yet still asks.
  bool get _hasLoad => _product?.hasLoad ?? true;

  /// What is being sold, in two taps: the product, then a usual load (or
  /// any other, typed).
  List<Widget> _liftFields(ColorScheme scheme) {
    final products = _products;
    if (products == null) {
      return const [LinearProgressIndicator()];
    }
    final picked = _productType;
    return [
      Text('Product', style: TextStyle(color: scheme.onSurfaceVariant)),
      const SizedBox(height: 8),
      if (products.isEmpty && picked == null)
        Text(
          'The product list did not load. The manager can pick it later.',
          style: TextStyle(color: scheme.onSurfaceVariant),
        ),
      Wrap(
        spacing: 8,
        runSpacing: 4,
        children: [
          // A product since removed from the list keeps its chip.
          if (picked != null && !products.any((p) => p.code == picked))
            ChoiceChip(
              label: Text(productLabel(picked)),
              selected: true,
              onSelected: (_) => setState(() {
                _productType = null;
                _dirty = true;
              }),
            ),
          for (final p in products)
            ChoiceChip(
              label: Text(p.name),
              selected: picked == p.code,
              // Tapping the chosen one again clears it.
              onSelected: (on) => setState(() {
                _productType = on ? p.code : null;
                _dirty = true;
              }),
            ),
        ],
      ),
      if (_hasLoad) ...[
        const SizedBox(height: 20),
        TextFormField(
          controller: _capacity,
          decoration: const InputDecoration(
            labelText: 'Capacity',
            suffixText: 'kg',
          ),
          style: mono,
          keyboardType: TextInputType.number,
          inputFormatters: [
            FilteringTextInputFormatter.digitsOnly,
            LengthLimitingTextInputFormatter(4),
          ],
          textInputAction: TextInputAction.next,
          // The calculator's own bounds, so the quotation can use it as is.
          validator: (v) {
            final kg = int.tryParse(v ?? '');
            final lowest = _product?.lowestKg ?? 320;
            return kg != null && (kg < lowest || kg > 5000)
                ? '$lowest to 5000 kg'
                : null;
          },
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            for (final kg
                in _product?.commonCapacities ??
                    const [450, 630, 800, 1000, 1600])
              ActionChip(
                label: Text('$kg kg'),
                onPressed: () => setState(() {
                  _capacity.text = '$kg';
                  _dirty = true;
                }),
              ),
          ],
        ),
      ],
    ];
  }

  /// One part of the sheet, on its own card.
  Widget _group(String title, List<Widget> fields) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(header: true, child: Eyebrow(title, color: accent)),
            const SizedBox(height: 14),
            ...fields,
          ],
        ),
      ),
    ),
  );

  // Length caps without maxLength: its counter clutters a short form.
  Widget _textField(
    TextEditingController c,
    String label, {
    String? hint,
    required int maxLength,
    bool words = false,
    bool figures = false,
  }) => TextFormField(
    controller: c,
    decoration: InputDecoration(labelText: label, hintText: hint),
    style: figures ? mono : null,
    textCapitalization: words
        ? TextCapitalization.words
        : TextCapitalization.sentences,
    textInputAction: TextInputAction.next,
    inputFormatters: [LengthLimitingTextInputFormatter(maxLength)],
  );

  Widget _mmField(TextEditingController c, String label) => TextFormField(
    controller: c,
    decoration: InputDecoration(labelText: label, suffixText: 'mm'),
    style: mono,
    keyboardType: TextInputType.number,
    // 20000 mm is the API's ceiling; five digits always parse.
    inputFormatters: [
      FilteringTextInputFormatter.digitsOnly,
      LengthLimitingTextInputFormatter(5),
    ],
    textInputAction: TextInputAction.next,
    validator: (v) {
      final mm = int.tryParse(v ?? '');
      return mm != null && (mm < 1 || mm > 20000) ? '1 to 20000 mm' : null;
    },
  );
}

const _gap = SizedBox(height: 16);

String _today() => _isoDate(DateTime.now());

String _isoDate(DateTime d) =>
    '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String? _text(TextEditingController c) =>
    c.text.trim().isEmpty ? null : c.text.trim();

int? _mm(TextEditingController c) => int.tryParse(c.text);
