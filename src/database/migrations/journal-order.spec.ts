import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const journal = JSON.parse(
  readFileSync(join(__dirname, 'meta', '_journal.json'), 'utf8'),
) as { entries: JournalEntry[] };

/**
 * Drizzle's migrator decides what still needs applying by comparing each
 * journal entry's `when` against the timestamp of the last migration already
 * recorded in the database — not by `idx`. So a migration whose `when` is
 * older than one already applied is silently skipped, forever, while
 * `db:migrate` still reports success.
 *
 * That is not hypothetical: 0039 was hand-authored with a made-up round
 * `when` (1786400000000) sitting in the future, and the next drizzle-kit
 * generated migration (0040, real clock, therefore earlier) was skipped on
 * every database that already had 0039. Its two columns were missing in an
 * apparently-migrated database and only surfaced when an e2e test touched
 * them; 0041 re-applied them idempotently.
 *
 * Hand-authored migrations are normal in this repo (RLS policies, REVOKEs,
 * partial indexes drizzle-kit cannot express). Fabricated timestamps are not.
 * Copy the real epoch millis from the previous entry and add one.
 */
describe('migration journal', () => {
  it('has strictly increasing timestamps, so no migration can be silently skipped', () => {
    const outOfOrder = journal.entries
      .map((entry, i) => ({ entry, previous: journal.entries[i - 1] }))
      .filter(({ entry, previous }) => previous !== undefined && entry.when <= previous.when)
      .map(
        ({ entry, previous }) =>
          `${entry.tag} (when=${entry.when}) is not after ${previous?.tag} (when=${previous?.when})`,
      );

    // 0039/0040 is the known historical breach, already repaired forward by
    // 0041. It stays listed here rather than being silently tolerated: the
    // assertion below still fails for any NEW breach.
    const known = ['0040_perfect_morgan_stark (when=1786396290398) is not after 0039_invoices_proforma_unique_partial_index (when=1786400000000)'];

    expect(outOfOrder.filter((problem) => !known.includes(problem))).toEqual([]);
  });

  it('has strictly increasing idx values matching their position', () => {
    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_entry, i) => i),
    );
  });
});
