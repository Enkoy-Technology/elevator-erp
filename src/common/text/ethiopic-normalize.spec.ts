import {
  ETHIOPIC_TRANSLATE_FROM,
  ETHIOPIC_TRANSLATE_TO,
  normalizeEthiopic,
} from './ethiopic-normalize';

// Every offset below is re-derived from the actual codepoints here (not
// copied from the implementation's comments) so a wrong offset in the fold
// table fails a test instead of silently shipping — see task-5-brief.md
// item 1: "verify each family's offset with a test rather than assuming".
const cp = (ch: string): number => ch.codePointAt(0)!;

describe('normalizeEthiopic — family offsets (verified against real codepoints)', () => {
  // Each family below is checked for its FULL assigned range, not the range
  // this file's comments claim — an earlier version of this table asserted
  // only 7 orders for HA/HHA/XA and TSA/TZA on an unverified assumption
  // that their 8th (labialized) order didn't exist or had no counterpart.
  // It does exist (confirmed via `unicodedata.name()` against real Unicode
  // data, not memory) and folds exactly like SA/SZA's 8th order does — see
  // the file header's "Correction" note. These tests assert the corrected,
  // verified length so that mistake can't silently come back.

  it('HHA (U+1210-1217) is a constant +0x10 offset from HA (U+1200-1207), full 8 orders', () => {
    const ha = [...'ሀሁሂሃሄህሆሇ'];
    const hha = [...'ሐሑሒሓሔሕሖሗ'];
    expect(ha).toHaveLength(8);
    expect(hha).toHaveLength(8);
    for (let i = 0; i < ha.length; i++) {
      expect(cp(hha[i]!) - cp(ha[i]!)).toBe(0x10);
      expect(normalizeEthiopic(hha[i]!)).toBe(ha[i]);
    }
  });

  it('XA (U+1280-1287) is a constant +0x80 offset from HA (U+1200-1207), full 8 orders', () => {
    const ha = [...'ሀሁሂሃሄህሆሇ'];
    const xa = [...'ኀኁኂኃኄኅኆኇ'];
    expect(xa).toHaveLength(8);
    for (let i = 0; i < ha.length; i++) {
      expect(cp(xa[i]!) - cp(ha[i]!)).toBe(0x80);
      expect(normalizeEthiopic(xa[i]!)).toBe(ha[i]);
    }
  });

  it('SZA (U+1220-1227) is a constant -0x10 offset from SA (U+1230-1237), full 8 orders', () => {
    const sa = [...'ሰሱሲሳሴስሶሷ'];
    const sza = [...'ሠሡሢሣሤሥሦሧ'];
    expect(sa).toHaveLength(8);
    expect(sza).toHaveLength(8);
    for (let i = 0; i < sa.length; i++) {
      expect(cp(sza[i]!) - cp(sa[i]!)).toBe(-0x10);
      expect(normalizeEthiopic(sza[i]!)).toBe(sa[i]);
    }
  });

  it('TZA (U+1340-1347) is a constant +8 offset from TSA (U+1338-133F), full 8 orders', () => {
    const tsa = [...'ጸጹጺጻጼጽጾጿ'];
    const tza = [...'ፀፁፂፃፄፅፆፇ'];
    expect(tsa).toHaveLength(8);
    expect(tza).toHaveLength(8);
    for (let i = 0; i < tsa.length; i++) {
      expect(cp(tza[i]!) - cp(tsa[i]!)).toBe(8);
      expect(normalizeEthiopic(tza[i]!)).toBe(tsa[i]);
    }
  });

  it('AIN/PHARYNGEAL A (U+12D0-12D6) is a constant +0x30 offset from GLOTTAL A (U+12A0-12A6), 7 orders — the one family that genuinely has no 8th', () => {
    const a = [...'አኡኢኣኤእኦ'];
    const ain = [...'ዐዑዒዓዔዕዖ'];
    expect(a).toHaveLength(7);
    expect(ain).toHaveLength(7);
    for (let i = 0; i < a.length; i++) {
      expect(cp(ain[i]!) - cp(a[i]!)).toBe(0x30);
      expect(normalizeEthiopic(ain[i]!)).toBe(a[i]);
    }
    // U+12D7, the would-be 8th order, really is unassigned in Unicode —
    // confirmed via `unicodedata.name(chr(0x12d7))` raising ValueError.
    // GLOTTAL WA (ኧ, U+12A7) therefore has no AIN counterpart to fold from.
    expect(normalizeEthiopic('ኧ')).toBe('ኧ');
  });
});

describe('normalizeEthiopic — behavior', () => {
  it('folds ሀ/ሐ/ኀ (and their vowel-order siblings) to one canonical form', () => {
    expect(normalizeEthiopic('ሀ')).toBe('ሀ');
    expect(normalizeEthiopic('ሐ')).toBe('ሀ');
    expect(normalizeEthiopic('ኀ')).toBe('ሀ');
    expect(normalizeEthiopic('ሔ')).toBe('ሄ'); // vowel order preserved across the fold
  });

  it('folds ሰ/ሠ', () => {
    expect(normalizeEthiopic('ሠ')).toBe('ሰ');
    expect(normalizeEthiopic('ሧ')).toBe('ሷ');
  });

  it('folds ጸ/ፀ', () => {
    expect(normalizeEthiopic('ፀ')).toBe('ጸ');
    expect(normalizeEthiopic('ፃ')).toBe('ጻ');
  });

  it('folds አ/ዐ', () => {
    expect(normalizeEthiopic('ዐ')).toBe('አ');
    expect(normalizeEthiopic('ዕ')).toBe('እ');
  });

  it('leaves ኸ (KXA) unchanged — not a homophone of ሀ in common usage', () => {
    expect(normalizeEthiopic('ኸ')).toBe('ኸ');
  });

  it('folds the 8th-order (labialized) members too, now that they are confirmed assigned', () => {
    expect(normalizeEthiopic('ሗ')).toBe('ሇ'); // HHWA -> HOA
    expect(normalizeEthiopic('ኇ')).toBe('ሇ'); // XOA -> HOA
    expect(normalizeEthiopic('ፇ')).toBe('ጿ'); // TZOA -> TSWA
  });

  it('leaves the genuinely separate ኈ-ኍ (XWA) labialized-consonant sub-series unchanged', () => {
    // Not the same thing as XA's 8th-order ኇ above — this is a distinct
    // "consonant+w+vowel" series (like ቈ Qwa off ቀ Qa) with no HA-family
    // counterpart.
    expect(normalizeEthiopic('ኈ')).toBe('ኈ');
    expect(normalizeEthiopic('ኍ')).toBe('ኍ');
  });

  it('strips the Ethiopic combining gemination mark', () => {
    expect(normalizeEthiopic(`ስ${'፟'}ራ`)).toBe('ስራ');
  });

  it('leaves the Ethiopic wordspace and other punctuation untouched', () => {
    expect(normalizeEthiopic('ሀይሉ፡ኀይሉ')).toBe('ሀይሉ፡ሀይሉ');
  });

  it('handles a mixed Amharic/Latin name end to end', () => {
    expect(normalizeEthiopic('ሐይሉ Elevator PLC')).toBe('ሀይሉ elevator plc');
  });

  it('passes non-Ethiopic characters through untouched (besides lowercasing Latin)', () => {
    expect(normalizeEthiopic('Addis Heights PLC 123!')).toBe(
      'addis heights plc 123!',
    );
  });

  it('is idempotent', () => {
    const inputs = ['ሐይሉ Elevator PLC', 'ሠራተኛ', 'ፀሐይ', 'ዐይን', 'plain text'];
    for (const input of inputs) {
      const once = normalizeEthiopic(input);
      expect(normalizeEthiopic(once)).toBe(once);
    }
  });
});

describe('ETHIOPIC_TRANSLATE_FROM/TO — sync source for the SQL backfill', () => {
  it('TO is exactly one shorter than FROM (the extra FROM char strips gemination)', () => {
    expect(ETHIOPIC_TRANSLATE_FROM).toHaveLength(
      ETHIOPIC_TRANSLATE_TO.length + 1,
    );
    expect(ETHIOPIC_TRANSLATE_FROM.endsWith('፟')).toBe(true);
  });

  it('every FROM[i]/TO[i] pair round-trips through normalizeEthiopic', () => {
    for (let i = 0; i < ETHIOPIC_TRANSLATE_TO.length; i++) {
      expect(normalizeEthiopic(ETHIOPIC_TRANSLATE_FROM[i]!)).toBe(
        ETHIOPIC_TRANSLATE_TO[i],
      );
    }
  });
});
