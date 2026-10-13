/// One site collection form, as the API returns it
/// (`GET /v1/site-surveys/:id`). Only the project name is required; the rest
/// is whatever the salesperson could measure on site.
class Survey {
  const Survey({
    required this.id,
    required this.surveyDate,
    required this.projectName,
    this.address,
    this.contactName,
    this.contactPhone,
    this.shaftWidthMm,
    this.shaftDepthMm,
    this.floors,
    this.overheadMm,
    this.machineRoom,
    this.units,
    this.surveyedByName,
  });

  factory Survey.fromJson(Map<String, dynamic> json) => Survey(
    id: json['id'] as String,
    surveyDate: json['surveyDate'] as String,
    projectName: json['projectName'] as String,
    address: json['address'] as String?,
    contactName: json['contactName'] as String?,
    contactPhone: json['contactPhone'] as String?,
    shaftWidthMm: json['shaftWidthMm'] as int?,
    shaftDepthMm: json['shaftDepthMm'] as int?,
    floors: json['floors'] as String?,
    overheadMm: json['overheadMm'] as int?,
    machineRoom: json['machineRoom'] as String?,
    units: json['units'] as String?,
    surveyedByName: json['surveyedByName'] as String?,
  );

  final String id;

  /// 'YYYY-MM-DD', a plain date in the business timezone.
  final String surveyDate;
  final String projectName;
  final String? address;
  final String? contactName;
  final String? contactPhone;
  final int? shaftWidthMm;
  final int? shaftDepthMm;

  /// Free text exactly as written on the sheet, e.g. 'B+G+11'.
  final String? floors;
  final int? overheadMm;

  /// The sheet's own words: 'With MR' or 'MRL' (older sheets may hold others).
  final String? machineRoom;

  /// A number or a word, as written on the form.
  final String? units;
  final String? surveyedByName;
}

/// One page of `GET /v1/site-surveys`.
class SurveyPage {
  const SurveyPage({
    required this.items,
    required this.page,
    required this.total,
    required this.totalPages,
  });

  factory SurveyPage.fromJson(Map<String, dynamic> json) => SurveyPage(
    items: (json['items'] as List)
        .map((item) => Survey.fromJson(item as Map<String, dynamic>))
        .toList(),
    page: json['page'] as int,
    total: json['total'] as int,
    totalPages: json['totalPages'] as int,
  );

  final List<Survey> items;
  final int page;
  final int total;
  final int totalPages;
}

/// Short month names for showing a survey date.
const monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', //
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
