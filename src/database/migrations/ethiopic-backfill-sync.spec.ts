import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ETHIOPIC_TRANSLATE_FROM,
  ETHIOPIC_TRANSLATE_TO,
} from '../../common/text/ethiopic-normalize';

/**
 * The Ethiopic backfill in 0029_lying_marten_broadcloak.sql runs
 * translate("name", '<from>', '<to>') because the DB can't call
 * normalizeEthiopic() directly — the two literals were generated FROM
 * ETHIOPIC_TRANSLATE_FROM/TO at the time the migration was written and
 * pasted in. Nothing re-generates them automatically, so if the fold table
 * in ethiopic-normalize.ts ever changes, this is the test that catches the
 * migration file silently going stale.
 */
const MIGRATION_PATH = join(
  __dirname,
  '0029_lying_marten_broadcloak.sql',
);

describe('Ethiopic backfill migration stays in sync with ethiopic-normalize.ts', () => {
  it('the translate() literals in the migration match the live fold table', () => {
    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    const occurrences = [
      ...sql.matchAll(/translate\("name", '([^']*)', '([^']*)'\)/g),
    ];
    // Both the customers and projects UPDATE statements embed the literal —
    // check every occurrence, not just the first, so the two can't drift
    // from each other either.
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    for (const [, from, to] of occurrences) {
      expect(from).toBe(ETHIOPIC_TRANSLATE_FROM);
      expect(to).toBe(ETHIOPIC_TRANSLATE_TO);
    }
  });
});
