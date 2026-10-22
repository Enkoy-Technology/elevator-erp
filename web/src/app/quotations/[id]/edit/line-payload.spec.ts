import type { ProductTypeRow } from '../../../../lib/api';
import { NEW_LINE, toPayload, type LineDraft } from './line-payload';

/** What reaches the server: JSON drops a key left undefined. */
const sent = (
  draft: LineDraft,
  products: readonly ProductTypeRow[] = [],
): Record<string, unknown> =>
  JSON.parse(JSON.stringify(toPayload(draft, products))) as Record<
    string,
    unknown
  >;

const escalator = {
  code: 'ESCALATOR',
  effectiveFormula: 'Base price + (Rise − 6) × 500,000',
} as ProductTypeRow;

describe('toPayload', () => {
  it('leaves a cleared calculation box out, so the server keeps the stored figure', () => {
    const payload = sent({
      ...NEW_LINE,
      shaftWidthMm: '',
      shaftDepthMm: ' ',
      stops: '',
    });
    expect(payload).not.toHaveProperty('shaftWidthMm');
    expect(payload).not.toHaveProperty('shaftDepthMm');
    expect(payload).not.toHaveProperty('stops');
  });

  it('does not put the demo figures in for a blank car-lift box', () => {
    const payload = sent({
      ...NEW_LINE,
      productType: 'CAR_LIFT',
      shaftWidthMm: '',
      shaftDepthMm: '',
      capacityKg: '',
      speedMs: '',
      doorWidthMm: '',
      stops: '',
    });
    for (const key of [
      'shaftWidthMm',
      'shaftDepthMm',
      'capacityKg',
      'speedMs',
      'doorWidthMm',
      'stops',
    ]) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload.doorType).toBe(NEW_LINE.doorType);
  });

  it('leaves a blank rise out', () => {
    const payload = sent(
      { ...NEW_LINE, productType: 'ESCALATOR', travelHeightM: '' },
      [escalator],
    );
    expect(payload).not.toHaveProperty('travelHeightM');
  });

  it('sends what was typed', () => {
    expect(
      sent(
        {
          ...NEW_LINE,
          productType: 'ESCALATOR',
          travelHeightM: '10',
          stops: '2',
        },
        [escalator],
      ),
    ).toMatchObject({
      productType: 'ESCALATOR',
      shaftWidthMm: 1835,
      travelHeightM: 10,
      speedMs: 1.6,
      stops: 2,
    });
    expect(sent(NEW_LINE)).toMatchObject({
      shaftWidthMm: 1835,
      shaftDepthMm: 1750,
      stops: 12,
    });
  });
});
