import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api.dart';
import '../shaft_plan.dart';
import '../survey.dart';
import '../theme.dart';
import 'survey_form_screen.dart';

/// One survey, every field, blanks shown as a dash. Pops `true` when the
/// survey was edited or deleted, so the list reloads.
class SurveyDetailScreen extends StatefulWidget {
  const SurveyDetailScreen({super.key, required this.survey});

  final Survey survey;

  @override
  State<SurveyDetailScreen> createState() => _SurveyDetailScreenState();
}

class _SurveyDetailScreenState extends State<SurveyDetailScreen> {
  late Survey _survey = widget.survey;
  bool _changed = false;
  bool _deleting = false;

  Future<void> _edit() async {
    final updated = await Navigator.of(context).push<Survey>(
      MaterialPageRoute(builder: (_) => SurveyFormScreen(survey: _survey)),
    );
    if (updated != null) {
      setState(() {
        _survey = updated;
        _changed = true;
      });
    }
  }

  Future<void> _delete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Delete the survey for ${_survey.projectName}?'),
        content: const Text('The sheet is removed for good.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _deleting = true);
    try {
      await api.deleteSurvey(_survey.id);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _deleting = false);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(e.message)));
    }
  }

  Future<void> _call(String phone) async {
    if (!await launchUrl(Uri(scheme: 'tel', path: phone)) && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This device cannot make calls.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = _survey;
    final theme = Theme.of(context);
    final date = DateTime.tryParse(s.surveyDate);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: Scaffold(
        appBar: AppBar(
          actions: [
            IconButton(
              tooltip: 'Edit',
              icon: const Icon(Icons.edit_outlined),
              onPressed: _deleting ? null : _edit,
            ),
            IconButton(
              tooltip: 'Delete',
              icon: const Icon(Icons.delete_outline),
              onPressed: _deleting ? null : _delete,
            ),
            const SizedBox(width: 4),
          ],
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Container(
                padding: const EdgeInsets.fromLTRB(22, 22, 22, 20),
                decoration: BoxDecoration(
                  color: ink,
                  borderRadius: BorderRadius.circular(28),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Eyebrow(
                      date == null
                          ? s.surveyDate
                          : '${date.day} ${monthNames[date.month - 1]} ${date.year}',
                      color: accent,
                    ),
                    const SizedBox(height: 10),
                    Semantics(
                      header: true,
                      child: Text(
                        s.projectName,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          color: Colors.white,
                        ),
                      ),
                    ),
                    if (_has(s.address)) ...[
                      const SizedBox(height: 6),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Padding(
                            padding: EdgeInsets.only(top: 2),
                            child: Icon(
                              Icons.place_outlined,
                              size: 18,
                              color: Colors.white54,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              s.address!,
                              style: theme.textTheme.bodyLarge?.copyWith(
                                color: Colors.white70,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 22),
                    SizedBox(
                      height: 190,
                      child: ShaftPlan(
                        width: s.shaftWidthMm,
                        depth: s.shaftDepthMm,
                        line: Colors.white,
                        background: ink,
                      ),
                    ),
                    const SizedBox(height: 18),
                    const Divider(color: Colors.white12),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        _figure('Width', s.shaftWidthMm),
                        _figure('Depth', s.shaftDepthMm),
                        _figure('OH', s.overheadMm),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _contact(s),
              const SizedBox(height: 28),
              const Eyebrow('Details', rule: true),
              const SizedBox(height: 6),
              _spec('Floors', s.floors),
              _spec('Machine room', s.machineRoom),
              _spec('Units', s.units),
              _spec('Collected by', s.surveyedByName, plain: true),
            ],
          ),
        ),
      ),
    );
  }

  Widget _contact(Survey s) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final phone = s.contactPhone;
    final name = _has(s.contactName) ? s.contactName! : null;
    if (name == null && !_has(phone)) {
      return Text(
        'No contact recorded.',
        style: TextStyle(color: scheme.onSurfaceVariant),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
        child: Row(
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: scheme.surfaceContainerHighest,
              foregroundColor: scheme.onSurface,
              child: name == null
                  ? const Icon(Icons.person_outline)
                  : Text(
                      name.trim()[0].toUpperCase(),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name ?? 'Contact', style: theme.textTheme.titleMedium),
                  Text(
                    _has(phone) ? phone! : 'No telephone',
                    style: mono.copyWith(
                      fontSize: 14,
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            if (_has(phone))
              IconButton.filled(
                tooltip: 'Call $phone',
                style: IconButton.styleFrom(
                  backgroundColor: accent,
                  foregroundColor: Colors.white,
                ),
                icon: const Icon(Icons.call),
                onPressed: () => _call(phone!),
              ),
          ],
        ),
      ),
    );
  }

  /// A measurement on the dark header: mono figure, unit in grey.
  Widget _figure(String label, int? mm) => Expanded(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Eyebrow(label, color: Colors.white54),
        const SizedBox(height: 4),
        Text.rich(
          mm == null
              ? const TextSpan(text: '—')
              : TextSpan(
                  children: [
                    TextSpan(text: '$mm'),
                    const TextSpan(
                      text: ' mm',
                      style: TextStyle(fontSize: 12, color: Colors.white54),
                    ),
                  ],
                ),
          semanticsLabel: mm == null ? 'Not recorded' : '$mm millimetres',
          style: mono.copyWith(fontSize: 20, color: Colors.white),
        ),
      ],
    ),
  );

  /// A spec-sheet row: label left, value right, hairline under.
  Widget _spec(String label, String? value, {bool plain = false}) {
    final scheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: scheme.outlineVariant)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 14),
        child: Row(
          children: [
            Text(label, style: TextStyle(color: scheme.onSurfaceVariant)),
            const SizedBox(width: 16),
            Expanded(
              child: _has(value)
                  ? Text(
                      value!,
                      textAlign: TextAlign.end,
                      style: plain
                          ? const TextStyle(fontWeight: FontWeight.w600)
                          : mono.copyWith(fontSize: 15),
                    )
                  : const Text(
                      '—',
                      textAlign: TextAlign.end,
                      semanticsLabel: 'Not recorded',
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

bool _has(String? value) => value != null && value.trim().isNotEmpty;
