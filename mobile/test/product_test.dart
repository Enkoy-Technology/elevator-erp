import 'package:flutter_test/flutter_test.dart';
import 'package:site_survey/survey.dart';

void main() {
  test('capacity chips start at the product minimum', () {
    expect(const Product('PASSENGER', 'Passenger').commonCapacities, [
      450,
      630,
      800,
      1000,
      1600,
    ]);
    expect(
      const Product(
        'CAR_LIFT',
        'Car lift',
        minCapacityKg: 3500,
      ).commonCapacities,
      [3500, 4000, 5000],
    );
    expect(
      const Product(
        'HOSPITAL',
        'Hospital',
        minCapacityKg: 1000,
      ).commonCapacities,
      [1000, 1600],
    );
    expect(const Product('ESCALATOR', 'Escalator').commonCapacities, isEmpty);
  });
}
