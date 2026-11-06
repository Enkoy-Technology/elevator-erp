import type { CalcInputPayload, ProductTypeRow } from './api';
import {
  offerPreviewEtb,
  specEdit,
  startingSpeedAndDoor,
  figure,
  toRequest,
  withProduct,
  WORKED_EXAMPLE,
  type PassengerShaft,
} from './lift-form';

const product = (
  code: string,
  minCapacityKg: number | null = null,
): ProductTypeRow => ({
  id: code,
  code,
  name: code,
  basePriceEtb: '0.00',
  perStopEtb: '0.00',
  perKgEtb: '0.00',
  kgStep: 100,
  refStops: 2,
  refCapacityKg: 1000,
  minCapacityKg,
  formula: null,
  effectiveFormula: '',
  liftGeometry: true,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
});

const products = [
  product('PASSENGER'),
  product('CAR_LIFT', 3500),
  product('CAR_STACKING_LIFT', 3500),
  product('ESCALATOR'),
];

describe('startingSpeedAndDoor', () => {
  it('drops a door narrower than a typed door may be, as a narrow shaft gives', () => {
    const start = startingSpeedAndDoor('OTHER', {
      ...WORKED_EXAMPLE,
      doorWidthMm: 675,
    });
    expect(start.doorWidthMm).toBe(WORKED_EXAMPLE.doorWidthMm);
  });

  it("starts an escalator at the sheet's 6 m base rise and 2 stops, not the passenger example's 45 m", () => {
    const start = startingSpeedAndDoor('ESCALATOR', WORKED_EXAMPLE);
    expect(start.travelHeightM).toBe(6);
    expect(start.stops).toBe(2);
  });

  it.each(['CAR_LIFT', 'CAR_PLATFORM_LIFT', 'CAR_STACKING_LIFT'])(
    "starts %s at the sheet's base N / L of 2",
    (code) => {
      const start = startingSpeedAndDoor(code, WORKED_EXAMPLE);
      expect(start.stops).toBe(2);
      expect(start.travelHeightM).toBeUndefined();
    },
  );

  it('leaves the stops alone between passenger-class products', () => {
    const start = startingSpeedAndDoor('HOSPITAL', WORKED_EXAMPLE);
    expect(start.stops).toBeUndefined();
    expect(start.shaftWidthMm).toBeUndefined();
  });

  it('gives a passenger lift back the shaft it had before the vehicle', () => {
    const fromCarLift = {
      ...WORKED_EXAMPLE,
      ...startingSpeedAndDoor('CAR_LIFT', WORKED_EXAMPLE),
      productType: 'CAR_LIFT',
    };
    expect(
      startingSpeedAndDoor('PASSENGER', fromCarLift, {
        shaftWidthMm: 2000,
        shaftDepthMm: 2200,
      }),
    ).toMatchObject({ shaftWidthMm: 2000, shaftDepthMm: 2200 });
    // Nothing remembered: the worked example's shaft, not the 3400 × 6500 opening.
    expect(startingSpeedAndDoor('PASSENGER', fromCarLift)).toMatchObject({
      shaftWidthMm: 1835,
      shaftDepthMm: 1750,
    });
  });
});

describe('withProduct', () => {
  it('remembers the passenger shaft through a vehicle and back', () => {
    const memory: { current: PassengerShaft | null } = { current: null };
    const survey: CalcInputPayload = {
      ...WORKED_EXAMPLE,
      shaftWidthMm: 2000,
      shaftDepthMm: 2200,
    };
    const car = withProduct(survey, 'CAR_LIFT', products, memory);
    expect(car).toMatchObject({
      productType: 'CAR_LIFT',
      shaftWidthMm: 3400,
      shaftDepthMm: 6500,
      stops: 2,
      capacityKg: 3500,
      speedMs: 0.5,
    });
    const stacking = withProduct(car, 'CAR_STACKING_LIFT', products, memory);
    const back = withProduct(stacking, 'PASSENGER', products, memory);
    expect(back).toMatchObject({
      productType: 'PASSENGER',
      shaftWidthMm: 2000,
      shaftDepthMm: 2200,
      speedMs: WORKED_EXAMPLE.speedMs,
    });
  });

  it('drops a typed load and persons: each product starts at its own figures', () => {
    const memory = { current: null };
    const next = withProduct(
      {
        ...WORKED_EXAMPLE,
        capacityKgOverride: 800,
        capacityPersonsOverride: 10,
      },
      'HOSPITAL',
      products,
      memory,
    );
    expect(next.capacityKgOverride).toBeUndefined();
    expect(next.capacityPersonsOverride).toBeUndefined();
  });

  it('drops a typed speed and car: they belong to the lift they were typed for', () => {
    const next = withProduct(
      {
        ...WORKED_EXAMPLE,
        speedMsOverride: 1.6,
        carWidthMmOverride: 1200,
        carDepthMmOverride: 1500,
        carHeightMmOverride: 2300,
      },
      'HOSPITAL',
      products,
      { current: null },
    );
    expect(next.speedMsOverride).toBeUndefined();
    expect(next.carWidthMmOverride).toBeUndefined();
    expect(next.carDepthMmOverride).toBeUndefined();
    expect(next.carHeightMmOverride).toBeUndefined();
  });

  it('opens an escalator at its base rise', () => {
    const memory = { current: null };
    expect(
      withProduct(WORKED_EXAMPLE, 'ESCALATOR', products, memory),
    ).toMatchObject({ travelHeightM: 6, stops: 2, shaftWidthMm: 1000 });
  });
});

describe('toRequest', () => {
  it("sends a standard lift's typed load and persons with its shaft and floors", () => {
    expect(
      toRequest({
        ...WORKED_EXAMPLE,
        capacityKgOverride: 800,
        capacityPersonsOverride: 10,
      }),
    ).toMatchObject({
      shaftWidthMm: 1835,
      floors: 12,
      capacityKgOverride: 800,
      capacityPersonsOverride: 10,
    });
  });

  it("sends typed persons outside the table but never the table's load, and neither for an escalator", () => {
    const car = toRequest(
      {
        ...WORKED_EXAMPLE,
        productType: 'CAR_LIFT',
        capacityKg: 3500,
        capacityKgOverride: 800,
        capacityPersonsOverride: 2,
      },
      products,
    );
    expect(car).toMatchObject({ capacityKg: 3500, capacityPersonsOverride: 2 });
    expect(car).not.toHaveProperty('capacityKgOverride');
    const steps = toRequest(
      {
        ...WORKED_EXAMPLE,
        productType: 'ESCALATOR',
        capacityPersonsOverride: 2,
      },
      products,
    );
    expect(steps).not.toHaveProperty('capacityPersonsOverride');
  });
});

describe('toRequest typed speed and car', () => {
  const typed = {
    ...WORKED_EXAMPLE,
    speedMsOverride: 1.6,
    carWidthMmOverride: 1200,
    carDepthMmOverride: 1500,
    carHeightMmOverride: 2300,
  };

  it('sends them for a standard lift', () => {
    expect(toRequest(typed)).toMatchObject({
      speedMsOverride: 1.6,
      carWidthMmOverride: 1200,
      carDepthMmOverride: 1500,
      carHeightMmOverride: 2300,
    });
  });

  it('never for a lift outside the table, which has its own speed and platform', () => {
    const car = toRequest({ ...typed, productType: 'CAR_LIFT' }, products);
    expect(car).not.toHaveProperty('speedMsOverride');
    expect(car).not.toHaveProperty('carWidthMmOverride');
    expect(car).not.toHaveProperty('carDepthMmOverride');
    expect(car).not.toHaveProperty('carHeightMmOverride');
  });
});

describe('figure', () => {
  it('reads a number, and a box with no number in it as blank', () => {
    expect(figure('42.5')).toBe(42.5);
    expect(figure('')).toBeUndefined();
    expect(figure(' ')).toBeUndefined();
    expect(figure('.')).toBeUndefined();
  });
});

describe('withProduct travel height', () => {
  it('drops a typed travel: a 42 m typed on a passenger lift printed on a 2-stop car lift', () => {
    expect(
      withProduct(
        { ...WORKED_EXAMPLE, travelHeightMOverride: 42 },
        'CAR_LIFT',
        [],
        { current: null },
      ).travelHeightMOverride,
    ).toBeUndefined();
  });
});

describe('toRequest travel height', () => {
  const rise = {
    code: 'ESCALATOR',
    effectiveFormula: 'Base price + (Rise − 6) × 500,000',
  } as ProductTypeRow;
  const typed = { ...WORKED_EXAMPLE, travelHeightMOverride: 30 };

  it('sends what was typed on a passenger lift and on a car lift', () => {
    expect(toRequest(typed).travelHeightMOverride).toBe(30);
    expect(
      toRequest({ ...typed, productType: 'CAR_LIFT' }).travelHeightMOverride,
    ).toBe(30);
  });

  it('sends nothing when blank, whatever the form still holds as its old travel', () => {
    const request = JSON.parse(
      JSON.stringify(toRequest(WORKED_EXAMPLE)),
    ) as Record<string, unknown>;
    expect(request).not.toHaveProperty('travelHeightMOverride');
    expect(request).not.toHaveProperty('travelHeightM');
  });

  it('sends a rise-priced product its rise, not a typed travel', () => {
    const request = toRequest({ ...typed, productType: 'ESCALATOR' }, [rise]);
    expect(request.travelHeightM).toBe(WORKED_EXAMPLE.travelHeightM);
    expect(request.travelHeightMOverride).toBeUndefined();
  });
});

describe('offerPreviewEtb', () => {
  // The client's 800 kg, N=15 example: a 7,570,000 sheet price, VAT in.
  const inclusive = {
    totalBeforeMargin: '6582608.70',
    subtotalWithMargin: '6582608.70',
    listVatIncluded: '987391.30',
    listVatPercent: '15.00',
  };

  it("is the sheet's figure exactly when VAT is charged at the list's own rate", () => {
    expect(
      offerPreviewEtb(inclusive, {
        marginPercent: 0,
        quantity: 1,
        vatPercent: '15',
      }),
    ).toEqual({
      netEtb: '6582608.70',
      taxEtb: '987391.30',
      grossEtb: '7570000.00',
    });
  });

  it('is the sheet figure times the units, VAT being what is left over', () => {
    expect(
      offerPreviewEtb(
        {
          totalBeforeMargin: '3660869.57',
          subtotalWithMargin: '3660869.57',
          listVatIncluded: '549130.43',
          listVatPercent: '15.00',
        },
        { marginPercent: 0, quantity: 3, vatPercent: '15.00' },
      ),
    ).toEqual({
      netEtb: '10982608.71',
      taxEtb: '1647391.29',
      grossEtb: '12630000.00',
    });
  });

  it('puts the margin on the gross before multiplying', () => {
    expect(
      offerPreviewEtb(
        { ...inclusive, subtotalWithMargin: '7240869.57' },
        { marginPercent: 10, quantity: 2, vatPercent: '15' },
      ),
    ).toEqual({
      // 6,582,608.70 × 1.1 = 7,240,869.57; 7,570,000 × 1.1 = 8,327,000.
      netEtb: '14481739.14',
      taxEtb: '2172260.86',
      grossEtb: '16654000.00',
    });
  });

  it('adds VAT to the net when it is off or at another rate', () => {
    expect(
      offerPreviewEtb(inclusive, {
        marginPercent: 0,
        quantity: 1,
        vatPercent: '0',
      }),
    ).toEqual({ netEtb: '6582608.70', taxEtb: '0.00', grossEtb: '6582608.70' });
    expect(
      offerPreviewEtb(inclusive, {
        marginPercent: 0,
        quantity: 1,
        vatPercent: '10',
      }),
    ).toEqual({
      netEtb: '6582608.70',
      taxEtb: '658260.87',
      grossEtb: '7240869.57',
    });
  });

  it('takes the net the server stores, so a sub-cent list price is not rounded twice', () => {
    // A list of 100.004 at 25% margin: the server stores money(100.004 × 1.25)
    // = 125.01. Rounding the list first (100.00), then the margin, gives 125.00.
    expect(
      offerPreviewEtb(
        { totalBeforeMargin: '100.00', subtotalWithMargin: '125.01' },
        { marginPercent: 25, quantity: 1, vatPercent: '15' },
      ),
    ).toEqual({ netEtb: '125.01', taxEtb: '18.75', grossEtb: '143.76' });
  });

  it('adds VAT to the net when the list is net', () => {
    expect(
      offerPreviewEtb(
        { totalBeforeMargin: '7160000.00', subtotalWithMargin: '7160000.00' },
        { marginPercent: 0, quantity: 2, vatPercent: '15' },
      ),
    ).toEqual({
      netEtb: '14320000.00',
      taxEtb: '2148000.00',
      grossEtb: '16468000.00',
    });
  });
});

describe('specEdit', () => {
  const shown = {
    kg: '630',
    persons: '8',
    speed: '1.5',
    carWidth: '1100',
    carDepth: '1400',
    carHeight: '2400',
  };

  it('sends only the figure that was changed', () => {
    expect(specEdit({ ...shown, persons: '10' }, shown, true)).toEqual({
      capacityPersonsOverride: 10,
    });
    expect(specEdit({ ...shown, speed: '1.75' }, shown, true)).toEqual({
      speedMsOverride: 1.75,
    });
    expect(
      specEdit({ ...shown, carWidth: '1200', carHeight: '2300' }, shown, true),
    ).toEqual({ carWidthMmOverride: 1200, carHeightMmOverride: 2300 });
    expect(specEdit(shown, shown, true)).toEqual({});
  });

  it('sends a cleared box as undefined, back to the calculated figure', () => {
    const load = specEdit({ ...shown, kg: '' }, shown, true);
    expect(load).toHaveProperty('capacityKgOverride', undefined);
    const speed = specEdit({ ...shown, speed: ' ' }, shown, true);
    expect(speed).toHaveProperty('speedMsOverride', undefined);
    const car = specEdit({ ...shown, carDepth: '' }, shown, true);
    expect(car).toHaveProperty('carDepthMmOverride', undefined);
  });

  it('types the load, speed and car over only on a standard lift', () => {
    expect(
      specEdit(
        { ...shown, kg: '800', speed: '1', carWidth: '1200' },
        shown,
        false,
      ),
    ).toEqual({});
  });

  it('refuses what the API would, in words', () => {
    expect(specEdit({ ...shown, kg: '100' }, shown, true)).toEqual({
      error: 'Rated load is a whole number from 320 to 5,000 kg.',
    });
    expect(specEdit({ ...shown, persons: '1.5' }, shown, true)).toEqual({
      error: 'Persons is a whole number from 1 to 100.',
    });
  });
});
