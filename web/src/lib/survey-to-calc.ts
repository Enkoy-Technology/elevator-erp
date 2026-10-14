/**
 * The site survey's free text, read the way the calculator wants it. Both
 * return null for anything they cannot read with certainty: the quotation
 * form then keeps its own figure and the salesperson types the right one.
 */

/**
 * "B+G+11" is a basement, the ground floor and eleven above: 13 floors.
 * Each `+` part is a number of floors, or a level name (B, G, M, LG, P …)
 * that counts as one, or as many as its prefix says ("2B" is two basements).
 * A plain "12" is 12. Outside the calculator's 2–64, null.
 */
export const surveyFloors = (text: string | null): number | null => {
  if (!text?.trim()) return null;
  let total = 0;
  for (const part of text.split('+')) {
    const token = part.trim();
    const levels = /^(\d+)?\s*[a-z]{1,2}$/i.exec(token);
    if (/^\d+$/.test(token)) {
      total += Number(token);
    } else if (levels) {
      total += levels[1] ? Number(levels[1]) : 1;
    } else {
      return null;
    }
  }
  return total >= 2 && total <= 64 ? total : null;
};

/**
 * The floors named the way the quotation prints them, in the sheet's order:
 * "B+G+11" is B, G, 1 … 11; "2B+G+3" is B2, B, G, 1, 2, 3. A plain "12" is
 * twelve floors from the ground, G, 1 … 11. Null when `surveyFloors` is.
 */
export const surveyFloorLabels = (text: string | null): string | null => {
  const total = surveyFloors(text);
  if (total === null || !text) return null;
  const parts = text.split('+').map((part) => part.trim());
  if (parts.length === 1) {
    return [
      'G',
      ...Array.from({ length: total - 1 }, (_, i) => `${i + 1}`),
    ].join(',');
  }
  const labels: string[] = [];
  let upper = 0;
  for (const part of parts) {
    const levels = /^(\d+)?\s*([a-z]{1,2})$/i.exec(part);
    if (levels) {
      const name = levels[2].toUpperCase();
      const count = levels[1] ? Number(levels[1]) : 1;
      // Deepest first: two basements are B2 then B.
      for (let i = count; i >= 1; i--) {
        labels.push(i === 1 ? name : `${name}${i}`);
      }
    } else {
      for (let i = 0; i < Number(part); i++) {
        labels.push(String(++upper));
      }
    }
  }
  return labels.join(',');
};

/**
 * The sheet says "MRL" or "With MR". Anything negated ("No MR", "MR-less",
 * "without machine room") or otherwise unclear is left to the person.
 */
export const surveyMachineRoom = (text: string | null): 'MR' | 'MRL' | null => {
  if (!text) return null;
  if (/\bmrl\b/i.test(text)) return 'MRL';
  if (/\b(no|without|not)\b|-?\s*less\b/i.test(text)) return null;
  if (/\bmr\b|machine\s*room/i.test(text)) return 'MR';
  return null;
};
