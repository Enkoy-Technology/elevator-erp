import type { ProductTypeRow } from '../../../../lib/api';
import {
  NEW_LINE,
  speedForDraft,
  toPayload,
  type LineDraft,
} from './line-payload';

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

describe('speedForDraft', () => {
  it("keeps a stored speed nobody typed, but never a typed one: it would go out as the next product's own", () => {
    expect(speedForDraft({ speedMs: 1.5 })).toBe('1.5');
    expect(speedForDraft({ speedMs: 6, speedMsOverride: 6 })).toBe(
      NEW_LINE.speedMs,
    );
    expect(speedForDraft(null)).toBe(NEW_LINE.speedMs);
  });
});

describe('toPayload', () => {
  it('sends a typed load and persons, and null for a blank one so the derived figure comes back', () => {
    expect(
      sent({
        ...NEW_LINE,
        capacityKgOverride: '800',
        capacityPersonsOverride: '10',
      }),
    ).toMatchObject({ capacityKgOverride: 800, capacityPersonsOverride: 10 });
    const blank = sent({
      ...NEW_LINE,
      capacityKgOverride: ' ',
      capacityPersonsOverride: '',
    });
    expect(blank.capacityKgOverride).toBeNull();
    expect(blank.capacityPersonsOverride).toBeNull();
  });

  it('sends an empty description, which has the system write it again', () => {
    expect(sent({ ...NEW_LINE, specSummary: '  ' }).specSummary).toBe('');
  });

  it("sends persons but not the table's load outside the table, and neither for an escalator", () => {
    const car = sent({
      ...NEW_LINE,
      productType: 'CAR_LIFT',
      capacityKgOverride: '800',
      capacityPersonsOverride: '2',
    });
    expect(car.capacityKgOverride).toBeNull();
    expect(car.capacityPersonsOverride).toBe(2);
    const steps = sent(
      { ...NEW_LINE, productType: 'ESCALATOR', capacityPersonsOverride: '2' },
      [escalator],
    );
    expect(steps.capacityPersonsOverride).toBeNull();
  });

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

  it('treats a box that is not a number as blank, never sending null', () => {
    const payload = sent({ ...NEW_LINE, shaftWidthMm: '.', stops: '1..' });
    expect(payload).not.toHaveProperty('shaftWidthMm');
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

  it("sends a typed speed and car, and null for a blank one so the table's comes back", () => {
    expect(
      sent({
        ...NEW_LINE,
        speedMsOverride: '1.6',
        carWidthMmOverride: '1200',
        carDepthMmOverride: '1500',
        carHeightMmOverride: '2300',
      }),
    ).toMatchObject({
      speedMsOverride: 1.6,
      carWidthMmOverride: 1200,
      carDepthMmOverride: 1500,
      carHeightMmOverride: 2300,
    });
    expect(sent(NEW_LINE)).toMatchObject({
      speedMsOverride: null,
      carWidthMmOverride: null,
      carDepthMmOverride: null,
      carHeightMmOverride: null,
    });
  });

  it('sends null for them on a lift outside the table, whatever the draft still holds', () => {
    expect(
      sent({
        ...NEW_LINE,
        productType: 'CAR_LIFT',
        speedMsOverride: '1.6',
        carWidthMmOverride: '1200',
      }),
    ).toMatchObject({ speedMsOverride: null, carWidthMmOverride: null });
  });

  it('sends a typed travel, and null for a blank one so 3.5 m a floor comes back', () => {
    expect(
      sent({ ...NEW_LINE, travelHeightMOverride: '30.5' }),
    ).toMatchObject({ travelHeightMOverride: 30.5 });
    expect(sent(NEW_LINE).travelHeightMOverride).toBeNull();
    // The stored 42 m is what a line carries back; it must never go out as typed.
    expect(sent({ ...NEW_LINE, travelHeightM: '42' })).not.toHaveProperty(
      'travelHeightM',
    );
  });

  it('never sends a typed travel for a product priced on its rise', () => {
    expect(
      sent(
        {
          ...NEW_LINE,
          productType: 'ESCALATOR',
          travelHeightM: '10',
          travelHeightMOverride: '50',
        },
        [escalator],
      ),
    ).toMatchObject({ travelHeightM: 10, travelHeightMOverride: null });
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
