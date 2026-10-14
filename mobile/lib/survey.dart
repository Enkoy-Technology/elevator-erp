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
    this.productType,
    this.capacityKg,
    this.projectId,
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
    productType: json['productType'] as String?,
    capacityKg: json['capacityKg'] as int?,
    projectId: json['projectId'] as String?,
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

  /// A product code from the company's price list, e.g. 'PASSENGER'.
  final String? productType;

  /// Rated load in kg, if the customer said.
  final int? capacityKg;

  /// Set once a manager has turned the survey into a project.
  final String? projectId;
  final String? surveyedByName;
}

/// One product from the company's price list (`GET /v1/product-types`).
class Product {
  const Product(this.code, this.name, {this.minCapacityKg});

  factory Product.fromJson(Map<String, dynamic> json) => Product(
    json['code'] as String,
    json['name'] as String,
    minCapacityKg: json['minCapacityKg'] as int?,
  );

  final String code;
  final String name;

  /// The smallest load it is sold at (a car lift from 3,500 kg); null for none.
  final int? minCapacityKg;

  /// The escalator is priced on its rise and has no rated load.
  bool get hasLoad => code != 'ESCALATOR';

  /// The lowest capacity the quotation will accept for this product.
  int get lowestKg => (minCapacityKg ?? 0) > 320 ? minCapacityKg! : 320;

  /// The loads a salesperson usually hears, from this product's minimum up.
  List<int> get commonCapacities {
    if (!hasLoad) return const [];
    final usual = lowestKg >= 2000
        ? [lowestKg, 4000, 5000]
        : const [450, 630, 800, 1000, 1600];
    return usual.where((kg) => kg >= lowestKg && kg <= 5000).toSet().toList();
  }
}

/// 'CAR_LIFT' as 'Car lift', for a code whose product name is not at hand.
String productLabel(String code) {
  final words = code.toLowerCase().replaceAll('_', ' ');
  return words.isEmpty ? code : words[0].toUpperCase() + words.substring(1);
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
