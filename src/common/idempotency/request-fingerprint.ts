import { createHash } from 'node:crypto';

/**
 * Deterministic fingerprint of a request body + the endpoint it was sent to,
 * for `IdempotencyKeysRepository.claim`'s replay/conflict check. Object keys
 * are sorted recursively so two structurally-identical bodies fingerprint
 * identically regardless of JSON key order — belt-and-suspenders (a browser
 * resubmitting the SAME JS object should already serialize keys in the same
 * order every time), not a response to an observed bug.
 */
export function fingerprintRequest(endpoint: string, body: unknown): string {
  return createHash('sha256')
    .update(`${endpoint}\n${canonicalJson(body ?? {})}`)
    .digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
