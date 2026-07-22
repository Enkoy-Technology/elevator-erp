import {
  applySoundexBonus,
  composeDuplicateScore,
  encodeGeohash,
  geoProximityScore,
  haversineMeters,
  normalizeName,
  normalizePhoneE164,
  recommendationForScore,
  REVIEW_THRESHOLD,
  BLOCK_THRESHOLD,
} from './duplicate-scoring';

describe('duplicate-scoring', () => {
  it('normalizes Ethiopian phones to E.164', () => {
    expect(normalizePhoneE164('0911234567')).toBe('+251911234567');
    expect(normalizePhoneE164('+251 911 234 567')).toBe('+251911234567');
    expect(normalizePhoneE164('911234567')).toBe('+251911234567');
  });

  it('normalizes names for comparison', () => {
    expect(normalizeName('  Addis Heights, PLC. ')).toBe('addis heights plc');
  });

  it('encodes a stable geohash', () => {
    const hash = encodeGeohash(9.03, 38.74, 7);
    expect(hash).toHaveLength(7);
    expect(encodeGeohash(9.03, 38.74, 7)).toBe(hash);
  });

  it('scores geo proximity: 1 under 100m', () => {
    expect(geoProximityScore(50)).toBe(1);
    expect(geoProximityScore(2400)).toBe(0);
    expect(geoProximityScore(1250)).toBeGreaterThan(0);
    expect(geoProximityScore(1250)).toBeLessThan(1);
  });

  it('computes haversine for nearby Addis points', () => {
    const meters = haversineMeters(9.03, 38.74, 9.0305, 38.7405);
    expect(meters).toBeLessThan(100);
  });

  it('applies Soundex bonus and caps at 1', () => {
    expect(applySoundexBonus(0.8, true)).toBe(0.95);
    expect(applySoundexBonus(0.95, true)).toBe(1);
  });

  it('renormalizes weights when geo/building missing', () => {
    // name=1, phone=1 → (0.35+0.25)/(0.35+0.25) = 1
    expect(
      composeDuplicateScore({ name: 1, phone: 1 }),
    ).toBe(1);
  });

  it('maps thresholds to recommendations', () => {
    expect(recommendationForScore(0.5)).toBe('OK');
    expect(recommendationForScore(REVIEW_THRESHOLD)).toBe(
      'REVIEW_BEFORE_CREATE',
    );
    expect(recommendationForScore(BLOCK_THRESHOLD)).toBe(
      'HIGH_CONFIDENCE_DUPLICATE',
    );
  });
});
