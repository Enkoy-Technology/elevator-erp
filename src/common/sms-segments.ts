/**
 * GSM 03.38 default alphabet — the "basic" table plus the "extension" table
 * (escaped with `\x1b`, which is why real GSM-7 encoders count each of these
 * as 2 septets; that nuance is not modelled here — see the ponytail note on
 * segmentsFor). A body using only these characters encodes as GSM-7; a
 * single character outside it (e.g. any Amharic/Ethiopic character) forces
 * the whole message to UCS-2.
 */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXTENDED = '^{}\\[~]|€';
const GSM7_CHARS = new Set([...GSM7_BASIC, ...GSM7_EXTENDED]);

const isGsm7Encodable = (body: string): boolean =>
  [...body].every((char) => GSM7_CHARS.has(char));

export type SmsEncoding = 'GSM7' | 'UCS2';

export interface SmsSegmentInfo {
  encoding: SmsEncoding;
  segments: number;
}

/**
 * How many SMS segments `body` will cost and under which encoding, so a
 * template author (or the future reminders UI) can see a bill impact before
 * sending — not stored on the outbox row, only ever computed on demand (see
 * task brief 5.3).
 *
 * ponytail: GSM-7 extended-table characters (`^{}\[~]|€`) actually cost 2
 * septets each on a real handset, which would shrink the usable length
 * slightly for a body that uses them heavily. Not accounted for here — add
 * per-character septet weighting if a template ever leans on those symbols
 * enough for it to matter.
 */
export function segmentsFor(body: string): SmsSegmentInfo {
  const encoding: SmsEncoding = isGsm7Encodable(body) ? 'GSM7' : 'UCS2';
  const length = [...body].length;
  const singleSegmentLimit = encoding === 'GSM7' ? 160 : 70;
  const concatenatedSegmentSize = encoding === 'GSM7' ? 153 : 67;

  const segments =
    length <= singleSegmentLimit
      ? 1
      : Math.ceil(length / concatenatedSegmentSize);

  return { encoding, segments };
}
