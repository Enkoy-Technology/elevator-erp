import type { DuplicateRecommendation } from '../../common/types/duplicate.types';

/**
 * Pure helpers for customer duplicate detection (TAD §3.4 weights).
 * SQL trigram/Soundex/Haversine supply raw signal scores; this module
 * composes the weighted result and recommendation.
 */

export const DUP_WEIGHTS = {
  name: 0.35,
  phone: 0.25,
  geo: 0.25,
  building: 0.15,
} as const;

export const REVIEW_THRESHOLD = 0.75;
export const BLOCK_THRESHOLD = 0.9;

export type { DuplicateRecommendation };

export interface DuplicateSignalScores {
  /** 0–1 trigram (+ optional Soundex boost already applied). */
  name?: number;
  /** 1 exact match, else 0. Omit when neither side has a phone. */
  phone?: number;
  /** 0–1 proximity score. Omit when either side lacks coordinates. */
  geo?: number;
  /** 0–1 building trigram. Omit when either side lacks building name. */
  building?: number;
}

export const normalizeName = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Best-effort E.164 for Ethiopia (+251); otherwise digits with leading +. */
export const normalizePhoneE164 = (
  phone: string | null | undefined,
  defaultCountry = 'ET',
): string | null => {
  if (!phone) {
    return null;
  }
  const trimmed = phone.trim();
  if (!trimmed) {
    return null;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  if (defaultCountry === 'ET') {
    if (digits.startsWith('251') && digits.length >= 12) {
      return `+${digits}`;
    }
    if (digits.startsWith('0') && digits.length === 10) {
      return `+251${digits.slice(1)}`;
    }
    if (digits.length === 9 && digits.startsWith('9')) {
      return `+251${digits}`;
    }
  }
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  return `+${digits}`;
};

/**
 * Encode lat/lng to a geohash (precision 7 ≈ 150m).
 * Compact public-domain algorithm (no dependency).
 */
export const encodeGeohash = (
  latitude: number,
  longitude: number,
  precision = 7,
): string => {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = '';
  let latMin = -90;
  let latMax = 90;
  let lonMin = -180;
  let lonMax = 180;

  while (geohash.length < precision) {
    if (evenBit) {
      const mid = (lonMin + lonMax) / 2;
      if (longitude >= mid) {
        idx = idx * 2 + 1;
        lonMin = mid;
      } else {
        idx = idx * 2;
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (latitude >= mid) {
        idx = idx * 2 + 1;
        latMin = mid;
      } else {
        idx = idx * 2;
        latMax = mid;
      }
    }
    evenBit = !evenBit;
    if (bit < 4) {
      bit += 1;
    } else {
      geohash += base32.charAt(idx);
      bit = 0;
      idx = 0;
    }
  }
  return geohash;
};

/** Haversine distance in meters. */
export const haversineMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
};

/** Geo signal: 1 if <100m, else decays to 0 by 2.4km (≈ geohash-5 cell). */
export const geoProximityScore = (distanceMeters: number): number => {
  if (distanceMeters < 100) {
    return 1;
  }
  if (distanceMeters >= 2400) {
    return 0;
  }
  return 1 - (distanceMeters - 100) / (2400 - 100);
};

/**
 * Apply Soundex bonus to a trigram name score (capped at 1).
 */
export const applySoundexBonus = (
  nameSimilarity: number,
  soundexMatch: boolean,
): number => {
  const boosted = nameSimilarity + (soundexMatch ? 0.15 : 0);
  return Math.min(1, Math.round(boosted * 10_000) / 10_000);
};

/**
 * Weighted composite with renormalization over available signals.
 */
export const composeDuplicateScore = (
  signals: DuplicateSignalScores,
): number => {
  const parts: Array<{ weight: number; score: number }> = [];
  if (signals.name !== undefined) {
    parts.push({ weight: DUP_WEIGHTS.name, score: clamp01(signals.name) });
  }
  if (signals.phone !== undefined) {
    parts.push({ weight: DUP_WEIGHTS.phone, score: clamp01(signals.phone) });
  }
  if (signals.geo !== undefined) {
    parts.push({ weight: DUP_WEIGHTS.geo, score: clamp01(signals.geo) });
  }
  if (signals.building !== undefined) {
    parts.push({
      weight: DUP_WEIGHTS.building,
      score: clamp01(signals.building),
    });
  }
  if (parts.length === 0) {
    return 0;
  }
  const weightSum = parts.reduce((sum, p) => sum + p.weight, 0);
  const weighted = parts.reduce((sum, p) => sum + p.weight * p.score, 0);
  return Math.round((weighted / weightSum) * 10_000) / 10_000;
};

export const recommendationForScore = (
  score: number,
): DuplicateRecommendation => {
  if (score >= BLOCK_THRESHOLD) {
    return 'HIGH_CONFIDENCE_DUPLICATE';
  }
  if (score >= REVIEW_THRESHOLD) {
    return 'REVIEW_BEFORE_CREATE';
  }
  return 'OK';
};

const clamp01 = (value: number): number =>
  Math.min(1, Math.max(0, value));
