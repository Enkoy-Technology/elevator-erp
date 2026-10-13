import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../shaft_plan.dart';
import '../survey.dart';
import '../theme.dart';
import 'login_screen.dart';
import 'survey_detail_screen.dart';
import 'survey_form_screen.dart';

/// The salesperson's own surveys, newest first. The API already limits a
/// salesperson to their own sheets.
class SurveyListScreen extends StatefulWidget {
  const SurveyListScreen({super.key});

  @override
  State<SurveyListScreen> createState() => _SurveyListScreenState();
}

class _SurveyListScreenState extends State<SurveyListScreen> {
  final _surveys = <Survey>[];
  final _scroll = ScrollController();
  Timer? _debounce;
  String _search = '';
  int _page = 0;
  int _totalPages = 1;
  int? _total;
  String? _name;
  bool _loading = false;

  /// Bumped by every request, so a slow answer to an old search is dropped.
  int _request = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      // After a failure only the Try again button retries.
      if (_scroll.position.extentAfter < 400 && _error == null) _loadMore();
    });
    _reload();
    // Only the greeting needs it; without it the header just says hello.
    api.myName().then((name) {
      if (mounted) setState(() => _name = name);
    }, onError: (_) {});
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() => _loadMore(reset: true);

  Future<void> _loadMore({bool reset = false}) async {
    if (!reset && (_loading || _page >= _totalPages)) return;
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Page state only changes on success, so a failed reload never mixes
      // old rows with a fresh page 1.
      final result = await api.listSurveys(
        search: _search,
        page: reset ? 1 : _page + 1,
      );
      if (!mounted || request != _request) return;
      setState(() {
        if (reset) _surveys.clear();
        _surveys.addAll(result.items);
        _page = result.page;
        _totalPages = result.totalPages;
        _total = result.total;
      });
    } on ApiException catch (e) {
      if (mounted && request == _request) setState(() => _error = e.message);
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      _search = value.trim();
      _reload();
    });
  }

  /// Opens a screen and reloads the list when it reports a change.
  Future<void> _open(Widget screen) async {
    final changed = await Navigator.of(
      context,
    ).push<bool>(MaterialPageRoute(builder: (_) => screen));
    if (changed == true) _reload();
  }

  Future<void> _signOut() async {
    await api.logout();
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => const LoginScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final total = _total;
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _open(const SurveyFormScreen()),
        icon: const Icon(Icons.add, color: accent),
        label: const Text('New survey'),
      ),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: CustomScrollView(
          controller: _scroll,
          // Scrollable even when empty, so pull-to-refresh still works.
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverSafeArea(
              bottom: false,
              sliver: SliverPadding(
                padding: const EdgeInsets.fromLTRB(20, 12, 8, 0),
                sliver: SliverToBoxAdapter(
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _name == null
                                  ? 'Hello'
                                  : 'Hi, ${_name!.split(' ').first}',
                              style: TextStyle(
                                color: scheme.onSurfaceVariant,
                                fontSize: 15,
                              ),
                            ),
                            Text(
                              'My site surveys',
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                          ],
                        ),
                      ),
                      IconButton(
                        tooltip: 'Sign out',
                        icon: const Icon(Icons.logout),
                        onPressed: _signOut,
                      ),
                    ],
                  ),
                ),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
              sliver: SliverToBoxAdapter(child: _summary(total)),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              sliver: SliverToBoxAdapter(
                child: SearchBar(
                  hintText: 'Search project, address, contact',
                  leading: Icon(Icons.search, color: scheme.onSurfaceVariant),
                  elevation: const WidgetStatePropertyAll(0),
                  backgroundColor: WidgetStatePropertyAll(
                    scheme.surfaceContainerHighest,
                  ),
                  shape: WidgetStatePropertyAll(
                    RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                  padding: const WidgetStatePropertyAll(
                    EdgeInsets.symmetric(horizontal: 16),
                  ),
                  onChanged: _onSearch,
                ),
              ),
            ),
            if (_surveys.isEmpty)
              SliverFillRemaining(hasScrollBody: false, child: _empty())
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 112),
                sliver: SliverList.builder(
                  itemCount: _surveys.length + 1,
                  itemBuilder: (context, index) {
                    if (index == _surveys.length) return _footer();
                    final survey = _surveys[index];
                    // A month heading wherever the month changes.
                    final month = _monthOf(survey);
                    final heading =
                        index == 0 || _monthOf(_surveys[index - 1]) != month;
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (heading)
                            Padding(
                              padding: const EdgeInsets.fromLTRB(4, 14, 4, 10),
                              child: Eyebrow(month, rule: true),
                            ),
                          _SurveyCard(
                            survey: survey,
                            onTap: () =>
                                _open(SurveyDetailScreen(survey: survey)),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// The dark card: how many sheets are logged, and the latest one.
  Widget _summary(int? total) {
    final latest = _surveys.isEmpty ? null : _surveys.first;
    final date = latest == null ? null : DateTime.tryParse(latest.surveyDate);
    return Container(
      padding: const EdgeInsets.fromLTRB(22, 20, 22, 20),
      decoration: BoxDecoration(
        color: ink,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(
            total == null ? '–' : '$total',
            style: Theme.of(context).textTheme.headlineLarge?.copyWith(
              color: Colors.white,
              fontSize: 52,
              height: 1,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Eyebrow(
                    _search.isEmpty ? 'Surveys logged' : 'Matching',
                    color: accent,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    date == null
                        ? 'Your sheets show up here.'
                        : 'Latest ${date.day} ${monthNames[date.month - 1]} · '
                              '${latest!.projectName}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: Colors.white70),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _empty() {
    if (_loading && _error == null) {
      return const Center(child: CircularProgressIndicator());
    }
    final scheme = Theme.of(context).colorScheme;
    final (icon, title, body) = _error != null
        ? (Icons.cloud_off_outlined, 'Could not load surveys', _error!)
        : _search.isEmpty
        ? (
            Icons.straighten,
            'No surveys yet',
            'Measure a shaft, then tap New survey to log it.',
          )
        : (Icons.search_off, 'Nothing found', 'No survey matches "$_search".');
    return Padding(
      padding: const EdgeInsets.fromLTRB(40, 24, 40, 120),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Icon(icon, size: 32, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(height: 20),
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 6),
          Text(
            body,
            textAlign: TextAlign.center,
            style: TextStyle(color: scheme.onSurfaceVariant),
          ),
          if (_error != null) ...[
            const SizedBox(height: 20),
            FilledButton.tonal(
              onPressed: _reload,
              style: FilledButton.styleFrom(minimumSize: const Size(160, 48)),
              child: const Text('Try again'),
            ),
          ],
        ],
      ),
    );
  }

  Widget _footer() {
    if (_loading) {
      return const Padding(
        padding: EdgeInsets.all(16),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_error != null) {
      return Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(_error!, textAlign: TextAlign.center),
            TextButton(onPressed: _loadMore, child: const Text('Try again')),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }
}

/// One survey: a calendar tab for the date, then the project and whatever
/// was measured, as small tags.
class _SurveyCard extends StatelessWidget {
  const _SurveyCard({required this.survey, required this.onTap});

  final Survey survey;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final date = DateTime.tryParse(survey.surveyDate);
    final w = survey.shaftWidthMm;
    final d = survey.shaftDepthMm;
    final tags = [
      if (w != null && d != null)
        '$w × $d'
      else if (w != null)
        'W $w'
      else if (d != null)
        'D $d',
      if ((survey.floors ?? '').isNotEmpty) survey.floors!,
      if ((survey.machineRoom ?? '').isNotEmpty) survey.machineRoom!,
    ];
    return Card(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Column(
                  children: [
                    Text(
                      date == null ? '—' : '${date.day}',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        height: 1.1,
                      ),
                    ),
                    Text(
                      date == null
                          ? ''
                          : monthNames[date.month - 1].toUpperCase(),
                      style: mono.copyWith(
                        fontSize: 10,
                        letterSpacing: 1,
                        color: accent,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      survey.projectName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium,
                    ),
                    if ((survey.address ?? '').isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        survey.address!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                    if (tags.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [for (final t in tags) _Tag(t)],
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 10),
              SizedBox.square(
                dimension: 56,
                child: ShaftPlan(
                  width: survey.shaftWidthMm,
                  depth: survey.shaftDepthMm,
                  line: scheme.onSurface,
                  background: scheme.surfaceContainerLowest,
                  compact: true,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      borderRadius: BorderRadius.circular(6),
    ),
    child: Text(text, style: mono.copyWith(fontSize: 12)),
  );
}

/// "October 2026", or the raw text when the date does not parse.
String _monthOf(Survey survey) {
  final date = DateTime.tryParse(survey.surveyDate);
  return date == null
      ? survey.surveyDate
      : '${_fullMonths[date.month - 1]} ${date.year}';
}

const _fullMonths = [
  'January', 'February', 'March', 'April', 'May', 'June', //
  'July', 'August', 'September', 'October', 'November', 'December',
];
