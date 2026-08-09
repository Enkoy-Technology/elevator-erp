/**
 * Ethiopic homophone normalization — folds distinct Unicode codepoints that
 * Amharic speakers treat as interchangeable in personal/company names onto a
 * single canonical spelling, so a name written with one spelling and
 * searched with a homophone spelling still matches. The stored `name` column
 * keeps the original spelling; only a shadow `nameNormalized` column (and the
 * search query) run through this function.
 *
 * Families folded (canonical <- homophone), each verified order-by-order
 * against the real Unicode codepoint assignments in
 * `ethiopic-normalize.spec.ts` (offsets are re-derived from the codepoints
 * below, not assumed — see the correction note below on why that mattered):
 *
 *   ሀ (HA,          U+1200-1207, 8 orders) <- ሐ (HHA,          U+1210-1217, 8 orders)
 *                                          <- ኀ (XA,           U+1280-1287, 8 orders)
 *   ሰ (SA,          U+1230-1237, 8 orders) <- ሠ (SZA,          U+1220-1227, 8 orders)
 *   ጸ (TSA,         U+1338-133F, 8 orders) <- ፀ (TZA,          U+1340-1347, 8 orders)
 *   አ (GLOTTAL A,   U+12A0-12A7, 8 orders) <- ዐ (PHARYNGEAL A, U+12D0-12D6, 7 orders)
 *
 * Every family above has a full 8-member "1st (ä) .. 8th (labialized wa)"
 * vowel-order series in Unicode, and folds completely order-by-order, EXCEPT
 * PHARYNGEAL A ("Ain"), which Unicode only ever assigned 7 orders — U+12D7
 * (the would-be 8th, "PHARYNGEAL WA") was never assigned, so there is
 * nothing left over to decide for that one family.
 *
 * Correction: an earlier version of this table folded only orders 1-7 for
 * HA/HHA/XA and TSA/TZA, on the assumption that their 8th ("labialized wa")
 * order either didn't exist or had no clean counterpart — the same way the
 * genuinely-separate ኈ-ኍ (XWA) family below has no counterpart. That
 * assumption was never checked against real Unicode data and was wrong:
 * `python3 -c "import unicodedata; unicodedata.name(chr(0x1347))"` returns
 * `ETHIOPIC SYLLABLE TZOA` (assigned), and the same is true of ሇ (U+1207),
 * ሗ (U+1217) and ኇ (U+1287). All four are the ordinary 8th-order member of
 * their family, exactly analogous to SA/SZA's ሷ/ሧ pair, so they're folded
 * too now. This is exactly the "verify each family's offset with a test
 * rather than assuming" trap task-5-brief.md item 1 warned about.
 *
 * Deliberately NOT folded (the brief's "leave unchanged" branch — a
 * considered decision, not an unchecked assumption):
 *   - ኸ (KXA, U+12B8-12BE): not a homophone of ሀ in common usage, per the
 *     brief's explicit instruction.
 *   - ኈ-ኍ (XWA, U+1288-128D, 5 members: XWA/XWI/XWAA/XWEE/XWE): this is NOT
 *     the same thing as XA's 8th-order ኇ (XOA) above — it's a separate
 *     "consonant + w + vowel" labialized sub-series (compare ቈ Qwa off of
 *     ቀ Qa), phonetically distinct from anything in the HA family, with no
 *     non-arbitrary target. Left untouched.
 *
 * Also strips U+135F, the Ethiopic combining gemination mark — a diacritic
 * some writers add and others omit for the same word.
 *
 * The Ethiopic wordspace (፡) and other punctuation are deliberately left
 * alone: search already does substring LIKE matching, and wordspace handling
 * is speculative (task-5-brief.md item 1).
 *
 * Latin letters are lowercased via `toLowerCase()` in the same pass, so a
 * mixed Amharic/Latin name (e.g. "ሐይሉ Elevator PLC") folds to one canonical
 * form end to end.
 */

const GEMINATION_MARK = '፟';

/**
 * [canonical, homophone] codepoint pairs, one family block at a time, in
 * Unicode vowel-order (order 1 = "ä" form ... order 8 = labialized "wa"
 * form). Explicit pairs rather than an arithmetic offset, per the brief —
 * the accompanying spec re-derives and checks the offset per family instead
 * of trusting it here.
 */
const FOLD_FAMILIES: ReadonlyArray<readonly [canonical: string, homophone: string]> = [
  // HA (U+1200-1207) <- HHA (U+1210-1217), all 8 orders including the
  // labialized 8th (ሇ HOA <- ሗ HHWA).
  ['ሀ', 'ሐ'],
  ['ሁ', 'ሑ'],
  ['ሂ', 'ሒ'],
  ['ሃ', 'ሓ'],
  ['ሄ', 'ሔ'],
  ['ህ', 'ሕ'],
  ['ሆ', 'ሖ'],
  ['ሇ', 'ሗ'],
  // HA (U+1200-1207) <- XA (U+1280-1287), all 8 orders including the
  // labialized 8th (ሇ HOA <- ኇ XOA). Does NOT include the separate ኈ-ኍ
  // (XWA) sub-series — see file header.
  ['ሀ', 'ኀ'],
  ['ሁ', 'ኁ'],
  ['ሂ', 'ኂ'],
  ['ሃ', 'ኃ'],
  ['ሄ', 'ኄ'],
  ['ህ', 'ኅ'],
  ['ሆ', 'ኆ'],
  ['ሇ', 'ኇ'],
  // SA (U+1230-1237) <- SZA (U+1220-1227), all 8 orders.
  ['ሰ', 'ሠ'],
  ['ሱ', 'ሡ'],
  ['ሲ', 'ሢ'],
  ['ሳ', 'ሣ'],
  ['ሴ', 'ሤ'],
  ['ስ', 'ሥ'],
  ['ሶ', 'ሦ'],
  ['ሷ', 'ሧ'],
  // TSA (U+1338-133F) <- TZA (U+1340-1347), all 8 orders including the
  // labialized 8th (ጿ TSWA <- ፇ TZOA).
  ['ጸ', 'ፀ'],
  ['ጹ', 'ፁ'],
  ['ጺ', 'ፂ'],
  ['ጻ', 'ፃ'],
  ['ጼ', 'ፄ'],
  ['ጽ', 'ፅ'],
  ['ጾ', 'ፆ'],
  ['ጿ', 'ፇ'],
  // GLOTTAL A (U+12A0-12A6) <- PHARYNGEAL A / "AIN" (U+12D0-12D6), 7 orders
  // — AIN has no 8th order at all (U+12D7 is unassigned), so GLOTTAL WA
  // (ኧ, U+12A7) has nothing to fold from and stays as-is.
  ['አ', 'ዐ'],
  ['ኡ', 'ዑ'],
  ['ኢ', 'ዒ'],
  ['ኣ', 'ዓ'],
  ['ኤ', 'ዔ'],
  ['እ', 'ዕ'],
  ['ኦ', 'ዖ'],
];

const FOLD_MAP: ReadonlyMap<string, string> = new Map(
  FOLD_FAMILIES.map(([canonical, homophone]) => [homophone, canonical]),
);

/**
 * The same fold table, flattened to the `from`/`to` argument shape Postgres'
 * `translate(string, from, to)` takes, plus the gemination mark appended
 * only to `from` — `translate` deletes any `from` character past the end of
 * `to`, so this single extra character strips gemination in the same pass.
 * Exported so the migration's backfill SQL literal can be checked against it
 * (see ethiopic-normalize.spec.ts) rather than drifting silently.
 */
export const ETHIOPIC_TRANSLATE_FROM: string =
  FOLD_FAMILIES.map(([, homophone]) => homophone).join('') + GEMINATION_MARK;
export const ETHIOPIC_TRANSLATE_TO: string = FOLD_FAMILIES.map(
  ([canonical]) => canonical,
).join('');

export function normalizeEthiopic(input: string): string {
  let out = '';
  for (const ch of input) {
    if (ch === GEMINATION_MARK) {
      continue;
    }
    out += FOLD_MAP.get(ch) ?? ch;
  }
  return out.toLowerCase();
}
