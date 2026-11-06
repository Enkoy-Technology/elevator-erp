import { ElevatorCalcService } from './elevator-calc.service';
import {
  PASSENGER_LIFTS,
  PASSENGER_SHAFT_RANGES,
  selectPassengerLift,
} from './passenger-table';
import {
  DEFAULT_PRODUCT_TYPES,
  type ProductTypesRepository,
} from './product-types.repository';
import type { CalcInput, CalcRequest } from './types';
import { DEFAULT_PRICING_FORMULA } from '../../common/formula';

const TENANT_ID = '22222222-2222-2222-2222-222222222222';

/** The company's list, exactly as the repository would seed it. */
const productTypes = {
  findByCode: jest.fn(async (_tenantId: string, code: string) => {
    const row = DEFAULT_PRODUCT_TYPES.find((p) => p.code === code);
    return row ? { ...row, tenantId: TENANT_ID, id: code, sortOrder: 0 } : null;
  }),
  pricingSettings: jest.fn(async () => ({
    formula: DEFAULT_PRICING_FORMULA,
    priceListVatPercent: null,
  })),
} as unknown as ProductTypesRepository;

/** The vehicle products and the escalator carry the company's standard speed and door; the passenger fixture's figures are refused for them. */
const forProduct = (productType: string): Partial<CalcInput> =>
  (
    {
      CAR_LIFT: { speedMs: 0.5, doorWidthMm: 2600, shaftWidthMm: 3400, shaftDepthMm: 6500 },
      CAR_PLATFORM_LIFT: { speedMs: 0.3, doorWidthMm: 2600, shaftWidthMm: 2900, shaftDepthMm: 5500 },
      CAR_STACKING_LIFT: { speedMs: 0.15, shaftWidthMm: 3100, shaftDepthMm: 5600 },
      ESCALATOR: { speedMs: 0.5, shaftWidthMm: 1600 },
    } as Record<string, Partial<CalcInput>>
  )[productType] ?? {};

/** §4.1 technical fixture; pricing comes from the §4.2 product price list. */
const WORKED_EXAMPLE: CalcInput = {
  productType: 'PASSENGER',
  capacityKg: 1000,
  stops: 12,
  travelHeightM: 45,
  speedMs: 1.6,
  machineRoomType: 'MRL',
  doorType: 'CENTER_OPEN',
  doorWidthMm: 900,
  buildingUsage: 'COMMERCIAL',
  marginPercent: 25,
  taxPercent: 5,
};

describe('ElevatorCalcService', () => {
  const service = new ElevatorCalcService(productTypes);
  const calc = (input: CalcRequest) => service.calculateSpecs(TENANT_ID, input);

  describe('§4.2.3 worked example', () => {
    let result: Awaited<ReturnType<typeof calc>>;
    beforeAll(async () => {
      result = await calc(WORKED_EXAMPLE);
    });

    it('computes technical specs for the fixture', async () => {
      expect(result.technical.capacityPersons).toBe(13);
      expect(result.technical.carWidthMm).toBe(1100);
      expect(result.technical.carDepthMm).toBe(1400);
      expect(result.technical.carHeightMm).toBe(2300);
      expect(result.technical.shaftWidthMm).toBe(1400);
      expect(result.technical.shaftDepthMm).toBe(1700);
      expect(result.technical.machineRoomWidthMm).toBeNull();
      expect(result.technical.guideRailSpec).toBe('T89-1/B');
      expect(result.technical.counterweightMassKg).toBe('450.00');
    });

    it('prices off the product price list, not the retired TAD matrix', async () => {
      // 12 stops, 1000 kg PASSENGER:
      //   7,000,000 + (12-10)×80,000 + (1000-630)×1,000 = 7,530,000
      expect(result.pricing.basePrice).toBe('7000000.00');
      expect(result.pricing.stopsAdjustment).toBe('160000.00');
      expect(result.pricing.capacityAdjustment).toBe('370000.00');
      expect(result.pricing.totalBeforeMargin).toBe('7530000.00');
    });

    it('applies margin then tax on top of the list price', async () => {
      // 7,530,000 × 1.25 = 9,412,500 ; × 1.05 = 9,883,125
      expect(result.pricing.marginAmount).toBe('1882500.00');
      expect(result.pricing.subtotalWithMargin).toBe('9412500.00');
      expect(result.pricing.totalPrice).toBe('9883125.00');
    });
  });

  describe('price list', () => {
    it("applies the tenant's formula exactly — the starter does not floor at the reference machine", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 5,
        capacityKg: 450,
        marginPercent: 0,
        taxPercent: 0,
      });
      // 7,000,000 + (5-10)×80,000 + (450-630)×1,000
      expect(result.pricing.stopsAdjustment).toBe('-400000.00');
      expect(result.pricing.capacityAdjustment).toBe('-180000.00');
      expect(result.pricing.totalPrice).toBe('6420000.00');
    });

    it('floors at the reference machine when the formula says max(0, …)', async () => {
      (productTypes.pricingSettings as jest.Mock).mockResolvedValueOnce({
        formula: 'base + max(0, N - 10) * perStop + max(0, C - 630) * perKg',
        priceListVatPercent: null,
      });
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 5,
        capacityKg: 450,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.pricing.stopsAdjustment).toBe('0.00');
      expect(result.pricing.capacityAdjustment).toBe('0.00');
      expect(result.pricing.totalPrice).toBe('7000000.00');
    });

    it('divides the VAT out of a VAT-inclusive price list so net + VAT is the sheet figure', async () => {
      (productTypes.pricingSettings as jest.Mock).mockResolvedValueOnce({
        formula: DEFAULT_PRICING_FORMULA,
        priceListVatPercent: '15.00',
      });
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 10,
        capacityKg: 630,
        marginPercent: 0,
        taxPercent: 15,
      });
      // The sheet says 7,000,000 for the base machine, VAT in.
      expect(result.pricing.basePrice).toBe('7000000.00');
      expect(result.pricing.listVatIncluded).toBe('913043.48');
      // The rate it was divided out at travels with it, so a quotation can
      // tell whether the VAT it charges is the VAT already in the sheet.
      expect(result.pricing.listVatPercent).toBe('15.00');
      expect(result.pricing.totalBeforeMargin).toBe('6086956.52');
      expect(result.pricing.taxAmount).toBe('913043.48');
      expect(result.pricing.totalPrice).toBe('7000000.00');
      expect(result.formula.working).toMatch(
        /less 15.00% VAT included in the list = 6,086,956.52/,
      );
    });

    it('leaves an ex-VAT price list alone — no listVatIncluded row', async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.pricing.listVatIncluded).toBeUndefined();
      expect(result.pricing.listVatPercent).toBeUndefined();
    });

    it('computes travel as 3.5 m × stops when a classic lift sends none', async () => {
      const { travelHeightM: _omitted, ...noTravel } = WORKED_EXAMPLE;
      const result = await calc({ ...noTravel, stops: 12 });
      expect(result.input.travelHeightM).toBe(42);
    });

    it("takes a car lift's travel from its stops, never a figure carried over from an earlier edit", async () => {
      // A 2-stop car lift (7 m) re-saved with 5 stops: the line edit still
      // carries the old 7 m, but a lift travels 3.5 m a stop.
      const result = await calc({
        ...WORKED_EXAMPLE,
        ...forProduct('CAR_LIFT'),
        productType: 'CAR_LIFT',
        capacityKg: 3500,
        stops: 5,
        travelHeightM: 7,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.input.travelHeightM).toBe(17.5);
    });

    it('takes a passenger lift typed in full off its stops too, not the travel typed beside them', async () => {
      const result = await calc({ ...WORKED_EXAMPLE, stops: 12, travelHeightM: 45 });
      expect(result.input.travelHeightM).toBe(42);
    });

    describe('a typed travel height (client, 2026-11-04)', () => {
      const passenger: CalcRequest = {
        productType: 'PASSENGER',
        shaftWidthMm: 1835,
        shaftDepthMm: 1750,
        floors: 12,
        marginPercent: 0,
        taxPercent: 0,
      };

      it('prints in place of 3.5 m a floor and leaves the price alone', async () => {
        const blank = await calc(passenger);
        const typed = await calc({ ...passenger, travelHeightMOverride: 30.5 });
        expect(blank.input.travelHeightM).toBe(42);
        expect(blank.input).not.toHaveProperty('travelHeightMOverride');
        expect(typed.input.travelHeightM).toBe(30.5);
        expect(typed.input.travelHeightMOverride).toBe(30.5);
        expect(typed.pricing).toEqual(blank.pricing);
      });

      it('says so to staff when it differs from 3.5 m a floor, and not when it is the same', async () => {
        const typed = await calc({ ...passenger, travelHeightMOverride: 30.5 });
        expect(typed.notes).toContain(
          'Travel typed as 30.5 m; 3.5 m a floor would be 42 m. The list price stays the same.',
        );
        const same = await calc({ ...passenger, travelHeightMOverride: 42 });
        expect(same.notes.join(' ')).not.toContain('Travel typed');
      });

      it('goes back to 3.5 m a floor when cleared with null', async () => {
        const result = await calc({ ...passenger, travelHeightMOverride: null });
        expect(result.input.travelHeightM).toBe(42);
        expect(result.input).not.toHaveProperty('travelHeightMOverride');
      });

      it('works the same on a lift typed in full and on a car lift', async () => {
        const classic = await calc({
          ...WORKED_EXAMPLE,
          travelHeightMOverride: 30,
        });
        expect(classic.input.travelHeightM).toBe(30);
        const car = await calc({
          ...WORKED_EXAMPLE,
          productType: 'CAR_LIFT',
          ...forProduct('CAR_LIFT'),
          capacityKg: 3500,
          stops: 5,
          travelHeightMOverride: 12,
        });
        expect(car.input.travelHeightM).toBe(12);
      });

      it("never moves an escalator's price: its figure is its own rise", async () => {
        const result = await calc({
          ...WORKED_EXAMPLE,
          productType: 'ESCALATOR',
          ...forProduct('ESCALATOR'),
          stops: 2,
          travelHeightM: 10,
          travelHeightMOverride: 50,
          marginPercent: 0,
          taxPercent: 0,
        });
        expect(result.input.travelHeightM).toBe(10);
        expect(result.input).not.toHaveProperty('travelHeightMOverride');
        expect(result.pricing.totalPrice).toBe('8000000.00');
      });
    });

    it('keeps a typed travel for a product whose formula prices the rise', async () => {
      (productTypes.pricingSettings as jest.Mock).mockResolvedValueOnce({
        formula: 'base + (travel - 35) * 10000',
        priceListVatPercent: null,
      });
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 12,
        travelHeightM: 45,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.input.travelHeightM).toBe(45);
      expect(result.pricing.totalPrice).toBe('7100000.00');
    });

    it("keeps an escalator's own rise — its price is the rise", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        productType: 'ESCALATOR',
        ...forProduct('ESCALATOR'),
        stops: 2,
        travelHeightM: 10,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.input.travelHeightM).toBe(10);
      expect(result.pricing.totalPrice).toBe('8000000.00');
    });

    it('refuses a capacity below the product minimum (car lifts are sold from 3,500 kg)', async () => {
      await expect(
        calc({
          ...WORKED_EXAMPLE,
          productType: 'CAR_LIFT',
          ...forProduct('CAR_LIFT'),
          capacityKg: 3000,
          marginPercent: 0,
          taxPercent: 0,
        }),
      ).rejects.toThrow(/sold from 3,500 kg/);
    });

    it('splits a non-additive formula into what the stops added and what the capacity added', async () => {
      (productTypes.pricingSettings as jest.Mock).mockResolvedValueOnce({
        formula: 'base + N * C * 10',
        priceListVatPercent: null,
      });
      const result = await calc({
        ...WORKED_EXAMPLE,
        stops: 12,
        capacityKg: 1000,
        marginPercent: 0,
        taxPercent: 0,
      });
      // at C=630: 7,000,000 + 75,600; total: 7,000,000 + 120,000
      expect(result.pricing.stopsAdjustment).toBe('75600.00');
      expect(result.pricing.capacityAdjustment).toBe('44400.00');
      expect(result.pricing.totalPrice).toBe('7120000.00');
    });

    it('refuses to quote off a formula that cannot be evaluated', async () => {
      (productTypes.pricingSettings as jest.Mock).mockResolvedValueOnce({
        formula: 'base + price',
        priceListVatPercent: null,
      });
      await expect(calc(WORKED_EXAMPLE)).rejects.toThrow(
        /pricing formula under Settings/,
      );
    });

    it('reads the base from the product list: one base per product, no height tiers', async () => {
      const totalAt = async (stops: number): Promise<string> =>
        (
          await calc({
            ...WORKED_EXAMPLE,
            stops,
            capacityKg: 630,
            marginPercent: 0,
            taxPercent: 0,
          })
        ).pricing.totalPrice;

      // 7,000,000 + (20-10)×80,000 — the base no longer jumps at 20 stops
      expect(await totalAt(20)).toBe('7800000.00');
      // 7,000,000 + (31-10)×80,000
      expect(await totalAt(31)).toBe('8680000.00');
    });

    it('prices every product at its base when asked for its own base machine', async () => {
      const baseOf = async (productType: string): Promise<string> => {
        const row = DEFAULT_PRODUCT_TYPES.find((p) => p.code === productType)!;
        return (
          await calc({
            ...WORKED_EXAMPLE,
            productType,
            stops: row.refStops,
            capacityKg: row.refCapacityKg,
            marginPercent: 0,
            taxPercent: 0,
          })
        ).pricing.totalPrice;
      };

      expect(await baseOf('HOSPITAL')).toBe('7000000.00');
      expect(await baseOf('PANORAMIC')).toBe('8000000.00');
      expect(await baseOf('HOME')).toBe('8000000.00');
      expect(await baseOf('CARGO')).toBe('8000000.00');
    });

    it('prices a car product at its smallest sellable machine, not the sheet base (sold from 3,500 kg)', async () => {
      const cheapest = async (productType: string): Promise<string> => {
        const row = DEFAULT_PRODUCT_TYPES.find((p) => p.code === productType)!;
        return (
          await calc({
            ...WORKED_EXAMPLE,
            ...forProduct(productType),
            productType,
            stops: row.refStops,
            capacityKg: row.minCapacityKg!,
            marginPercent: 0,
            taxPercent: 0,
          })
        ).pricing.totalPrice;
      };
      // 11,000,000 + (3,500 − 3,000) × 500
      expect(await cheapest('CAR_LIFT')).toBe('11250000.00');
      // 5,200,000 + (3,500 − 3,000) × 400
      expect(await cheapest('CAR_PLATFORM_LIFT')).toBe('5400000.00');
      // 5,200,000 + (3,500 − 2,000) × 400
      expect(await cheapest('CAR_STACKING_LIFT')).toBe('5800000.00');
    });

    it.each([
      ['CAR_PLATFORM_LIFT', { speedMs: 0.3, doorWidthMm: 2600 }],
      ['CAR_STACKING_LIFT', { speedMs: 0.15 }],
    ] as const)(
      'takes a %s opening from 2,000 wide × 5,000 deep (client, 2026-10-23)',
      async (productType, figures) => {
        const opening = (shaftWidthMm: number, shaftDepthMm: number) =>
          calc({
            ...WORKED_EXAMPLE,
            productType,
            ...figures,
            capacityKg: 3500,
            stops: 2,
            shaftWidthMm,
            shaftDepthMm,
          });
        expect((await opening(2000, 5000)).input).toMatchObject({
          shaftWidthMm: 2000,
          shaftDepthMm: 5000,
        });
        await expect(opening(1999, 5000)).rejects.toThrow(
          /at least 2,000 mm wide/,
        );
        await expect(opening(2000, 4999)).rejects.toThrow(
          /at least 5,000 mm deep/,
        );
      },
    );

    it("notes an opening smaller than the specification's own shaft or platform, without refusing it", async () => {
      const vehicle = (
        productType: string,
        figures: Partial<CalcRequest>,
        shaftWidthMm: number,
        shaftDepthMm: number,
      ) =>
        calc({
          ...WORKED_EXAMPLE,
          productType,
          ...figures,
          capacityKg: 3500,
          stops: 2,
          shaftWidthMm,
          shaftDepthMm,
        });
      const platform = { speedMs: 0.3, doorWidthMm: 2600 };
      expect(
        (await vehicle('CAR_PLATFORM_LIFT', platform, 2000, 5000)).notes,
      ).toEqual([
        expect.stringMatching(
          /2000 × 5000 mm opening is smaller than the 2900 × 5500 mm clear shaft.*manufacturer/,
        ),
      ]);
      expect(
        (await vehicle('CAR_STACKING_LIFT', { speedMs: 0.15 }, 2000, 5000)).notes,
      ).toEqual([
        expect.stringMatching(/smaller than the 2800 × 5500 mm platform/),
      ]);
      // At the specification's own figures there is nothing to say.
      expect(
        (await vehicle('CAR_PLATFORM_LIFT', platform, 2900, 5500)).notes,
      ).toEqual([]);
      expect(
        (await vehicle('CAR_LIFT', { speedMs: 0.5, doorWidthMm: 2600 }, 3400, 6500))
          .notes,
      ).toEqual([]);
    });

    it("holds the vehicle products to the company's standard speed and door (specification, 2026-10-06)", async () => {
      const car = (extra: Partial<CalcRequest>) =>
        calc({
          ...WORKED_EXAMPLE,
          productType: 'CAR_LIFT',
          ...forProduct('CAR_LIFT'),
          capacityKg: 3500,
          stops: 2,
          speedMs: 0.5,
          doorWidthMm: 2600,
          shaftWidthMm: 3400,
          shaftDepthMm: 6500,
          ...extra,
        });
      await expect(car({})).resolves.toBeDefined();
      await expect(car({ speedMs: 0.3 })).resolves.toBeDefined();
      await expect(car({ speedMs: 0.25 })).rejects.toThrow(/0\.3–0\.5 m\/s/);
      await expect(car({ speedMs: 1 })).rejects.toThrow(/0\.3–0\.5 m\/s/);
      await expect(car({ doorWidthMm: 2500 })).rejects.toThrow(/2,600–2,800 mm/);
      await expect(
        car({ productType: 'CAR_STACKING_LIFT', speedMs: 0.5 }),
      ).rejects.toThrow(/0\.08–0\.15 m\/s/);
      await expect(
        car({ productType: 'CAR_PLATFORM_LIFT', speedMs: 0.3, doorWidthMm: 2400 }),
      ).resolves.toBeDefined();
      await expect(
        car({ productType: 'CAR_PLATFORM_LIFT', speedMs: 0.3, doorWidthMm: 900 }),
      ).rejects.toThrow(/2,400–2,800 mm/);
    });

    it("takes the building's shaft for a vehicle product, at least the document's clear shaft, and prints it", async () => {
      const car = (extra: Partial<CalcRequest>) =>
        calc({
          ...WORKED_EXAMPLE,
          ...forProduct('CAR_LIFT'),
          productType: 'CAR_LIFT',
          ...forProduct('CAR_LIFT'),
          capacityKg: 3500,
          stops: 2,
          ...extra,
        });
      const ok = await car({ shaftWidthMm: 3600, shaftDepthMm: 7000 });
      expect(ok.technical.shaftWidthMm).toBe(3600);
      expect(ok.technical.shaftDepthMm).toBe(7000);
      expect(ok.input.shaftWidthMm).toBe(3600);
      await expect(car({ shaftWidthMm: undefined })).rejects.toThrow(/Missing shaftWidthMm/);
      await expect(car({ shaftWidthMm: 3000 })).rejects.toThrow(/at least 3,400 mm wide/);
      await expect(car({ shaftDepthMm: 6000 })).rejects.toThrow(/at least 6,500 mm deep/);
    });

    it('asks an escalator for its width only — no depth, no rated load, no machine room', async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        productType: 'ESCALATOR',
        speedMs: 0.5,
        shaftWidthMm: 1700,
        capacityKg: undefined,
        shaftDepthMm: undefined,
      });
      expect(result.input.capacityKg).toBe(0);
      expect(result.technical.shaftWidthMm).toBe(1700);
      expect(result.technical.shaftDepthMm).toBeNull();
      // Even when the form sends one, an escalator carries no machine room.
      expect(result.input).not.toHaveProperty('machineRoomType');
      // No door either: none asked for, 0 carried so nothing prints.
      const noDoor = await calc({
        productType: 'ESCALATOR',
        stops: 10,
        travelHeightM: 10,
        speedMs: 0.5,
        shaftWidthMm: 1700,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(noDoor.input.doorWidthMm).toBe(0);
      await expect(
        calc({ ...WORKED_EXAMPLE, productType: 'ESCALATOR', speedMs: 0.5, shaftWidthMm: 999 }),
      ).rejects.toThrow(/width of at least 1,000 mm/);
      const narrowest = await calc({
        ...WORKED_EXAMPLE,
        productType: 'ESCALATOR',
        speedMs: 0.5,
        shaftWidthMm: 1000,
      });
      expect(narrowest.technical.shaftWidthMm).toBe(1000);
    });

    it("prints a vehicle product's platform as its car, and the building's shaft, in the usual block", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        ...forProduct('CAR_LIFT'),
        productType: 'CAR_LIFT',
          ...forProduct('CAR_LIFT'),
        capacityKg: 3500,
        stops: 2,
      });
      expect(result.technical.carWidthMm).toBe(2800);
      expect(result.technical.carDepthMm).toBe(5600);
      expect(result.technical.shaftWidthMm).toBe(3400);
      expect(result.technical.shaftDepthMm).toBe(6500);
      expect(result.technical.counterweightMassKg).toBeNull();
      expect(result.notes).toEqual([]);
    });

    it('refuses a product that is not in the list', async () => {
      await expect(
        calc({ ...WORKED_EXAMPLE, productType: 'SPACE_ELEVATOR' }),
      ).rejects.toThrow(/Unknown product type/);
    });

    it("prices every worked example on the company's price sheet (2026-09-14)", async () => {
      const sheet = async (
        productType: string,
        capacityKg: number,
        stops: number,
        travelHeightM = 30,
      ): Promise<string> =>
        (
          await calc({
            ...WORKED_EXAMPLE,
            ...forProduct(productType),
            productType,
            capacityKg,
            stops,
            travelHeightM,
            marginPercent: 0,
            taxPercent: 0,
          })
        ).pricing.totalPrice;

      expect(await sheet('PASSENGER', 800, 15)).toBe('7570000.00');
      expect(await sheet('PANORAMIC', 800, 15)).toBe('8570000.00');
      expect(await sheet('CAR_LIFT', 5000, 3)).toBe('12300000.00');
      expect(await sheet('CAR_PLATFORM_LIFT', 5000, 3)).toBe('6250000.00');
      // L = 2 parking levels is the stop count
      expect(await sheet('CAR_STACKING_LIFT', 4000, 2)).toBe('6000000.00');
      expect(await sheet('CARGO', 2000, 5)).toBe('8850000.00');
      // Rise is the travel height; stops and capacity do not move an escalator
      expect(await sheet('ESCALATOR', 630, 10, 10)).toBe('8000000.00');
      expect(await sheet('ESCALATOR', 5000, 40, 10)).toBe('8000000.00');
    });

    it("uses the product's own formula over the company one, and splits the breakdown on it", async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        productType: 'ESCALATOR',
        ...forProduct('ESCALATOR'),
        travelHeightM: 10,
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.pricing.basePrice).toBe('6000000.00');
      expect(result.pricing.stopsAdjustment).toBe('2000000.00');
      expect(result.pricing.capacityAdjustment).toBe('0.00');
    });

    it('does not vary price by speed, door, machine room or building usage', async () => {
      const plain = await calc({ ...WORKED_EXAMPLE });
      const loaded = await calc({
        ...WORKED_EXAMPLE,
        speedMs: 6,
        doorType: 'TELESCOPIC',
        doorWidthMm: 1400,
        machineRoomType: 'MR',
        buildingUsage: 'HOSPITAL',
        travelHeightM: 200,
      });
      expect(loaded.pricing.totalPrice).toBe(plain.pricing.totalPrice);
    });
  });

  describe('boundary cases', () => {
    it('handles minimum capacity on an MRL lift, whose overhead is no different', async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        capacityKg: 320,
        stops: 2,
        travelHeightM: 3,
        speedMs: 0.4,
        machineRoomType: 'MRL',
        buildingUsage: 'RESIDENTIAL',
        marginPercent: 0,
        taxPercent: 0,
      });
      expect(result.technical.capacityPersons).toBe(4);
      expect(result.technical.machineRoomWidthMm).toBeNull();
      expect(result.technical.overheadClearanceMm).toBe(4500);
    });

    it('applies high-speed and INDUSTRIAL counterweight adjustments', async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        capacityKg: 2500,
        speedMs: 2.5,
        buildingUsage: 'INDUSTRIAL',
        machineRoomType: 'MR',
      });
      // v=2.5 is not >2.5, so factor stays 0.45+0.05 = 0.50 → 1250 kg
      expect(result.technical.counterweightMassKg).toBe('1250.00');
      expect(result.technical.machineRoomWidthMm).not.toBeNull();
      expect(result.technical.guideRailSpec).toBe('T127-2/B');
    });

    it('drops to T140 rail when speed exceeds the T127 band', async () => {
      const result = await calc({
        ...WORKED_EXAMPLE,
        capacityKg: 2500,
        speedMs: 3.0,
        machineRoomType: 'MR',
      });
      expect(result.technical.guideRailSpec).toBe('T140-3/B');
    });
    it('raises HOSPITAL car height', async () => {
      const hospital = await calc({
        ...WORKED_EXAMPLE,
        buildingUsage: 'HOSPITAL',
      });
      expect(hospital.technical.carHeightMm).toBe(2350);
    });

    // §4.1 is EN 81 *lift* geometry. A flat-priced escalator or platform lift
    // has no car, counterweight or guide rail, and the document renderers
    // drop absent keys — so emitting nulls here is what keeps a lift's
    // specification off an escalator quotation.
    it.each(['CAR_PLATFORM_LIFT', 'ESCALATOR'] as const)(
      'emits no EN 81 machine geometry for %s',
      async (productType) => {
        const result = await calc({
          ...WORKED_EXAMPLE,
          ...forProduct(productType),
          productType,
          // A car platform is sold from 3,500 kg; the fixture's 1,000 kg is a passenger figure.
          capacityKg: 3500,
        });

        expect(result.technical.productType).toBe(productType);
        for (const key of [
          'capacityPersons',
          'carHeightMm',
          'pitDepthMm',
          'counterweightMassKg',
          'motorPowerKw',
          'guideRailSpec',
          'machineRoomWidthMm',
        ] as const) {
          expect(result.technical[key]).toBeNull();
        }
        // Pricing is unaffected: flat, and still computed.
        expect(result.pricing.totalBeforeMargin).not.toBe('0.00');
      },
    );

    it('keeps the full lift geometry for PASSENGER', async () => {
      const result = await calc(WORKED_EXAMPLE);
      expect(result.technical.productType).toBe('PASSENGER');
      expect(result.technical.guideRailSpec).toBe('T89-1/B');
      expect(result.technical.carWidthMm).toBe(1100);
    });
  });

  describe('standard passenger lift (shaft + floors)', () => {
    const standard = (extra: Partial<CalcRequest>) =>
      service.calculateSpecs(TENANT_ID, {
        productType: 'PASSENGER',
        // The 8-person 630 kg standard row (2S door), its car known.
        shaftWidthMm: 1600,
        shaftDepthMm: 1850,
        floors: 8,
        marginPercent: 0,
        taxPercent: 0,
        ...extra,
      });

    it('names a hospital, panoramic, home or cargo lift from the shaft too — the same machines, another price', async () => {
      for (const productType of ['HOSPITAL', 'PANORAMIC', 'HOME', 'CARGO']) {
        const result = await standard({ productType });
        expect(result.technical.standardLift).toContain('8-person lift');
        expect(result.input.capacityKg).toBe(630);
        expect(result.technical.productType).toBe(productType);
      }
    });

    describe('the company formula picks the load (2026-11-05)', () => {
      it.each([
        // W × D in metres ÷ 0.33 persons, × 75 kg, to the nearest standard load.
        [1200, 1200, 4, 320],
        [1500, 1500, 6, 450],
        [2000, 1800, 10, 800],
        [2200, 1750, 10, 800],
        [2430, 1950, 15, 1150],
        [3200, 2800, 26, 2000],
      ])('%i × %i mm is %i persons, %i kg', (width, depth, persons, loadKg) => {
        expect(selectPassengerLift(width, depth).lift).toMatchObject({
          persons,
          loadKg,
        });
      });

      it('rounds the load alone and takes the persons from its row, so they never disagree', () => {
        // 1650 × 1850: 9.25 persons would round to 10, but 694 kg is nearer 630.
        expect(selectPassengerLift(1650, 1850).lift).toMatchObject({
          persons: 8,
          loadKg: 630,
        });
      });

      it('takes the lower load exactly halfway between two', () => {
        // 3300 × 3000 is 2250 kg, between 2000 and 2500.
        expect(selectPassengerLift(3300, 3000).lift.loadKg).toBe(2000);
      });

      it('stays on the 14 standard loads at both ends', () => {
        expect(selectPassengerLift(1000, 1000).lift.loadKg).toBe(320);
        expect(selectPassengerLift(5000, 5000).lift.loadKg).toBe(3000);
      });

      it('prices the load the formula gives', async () => {
        const result = await standard({ shaftWidthMm: 2200, shaftDepthMm: 1750 });
        expect(result.input.capacityKg).toBe(800);
        // 7,000,000 + (8-10)×80,000 + (800-630)×1,000
        expect(result.pricing.totalPrice).toBe('7010000.00');
      });

      it('shows staff the working when the shaft is not the lift\'s own', async () => {
        const result = await standard({ shaftWidthMm: 2200, shaftDepthMm: 1750 });
        expect(result.notes[0]).toMatch(
          /2200 × 1750 mm works out at 11\.7 persons, 875 kg; the nearest standard lift is the 10-person 800 kg/,
        );
      });

      it('quotes the formula load in a shaft too narrow for it, and says so', async () => {
        // 1000 × 3500 is 795.5 kg by area, but no 800 kg shaft is 1000 mm wide.
        const result = await standard({ shaftWidthMm: 1000, shaftDepthMm: 3500 });
        expect(result.input.capacityKg).toBe(800);
        expect(result.notes[0]).toMatch(
          /1000 × 3500 mm works out at 10\.6 persons, 795\.5 kg, but no shaft for the 10-person 800 kg fits inside it; to be confirmed by the manufacturer's drawing/,
        );
      });
    });

    it("reads the lift off the company's table from an exact shaft", async () => {
      const result = await standard({});
      expect(result.technical.capacityPersons).toBe(8);
      expect(result.input).toMatchObject({
        capacityKg: 630,
        stops: 8,
        travelHeightM: 28, // 8 floors × 3.5 m — the client's rule
        speedMs: 1.0,
        doorType: 'CENTER_OPEN',
        doorWidthMm: 700, // (1600 - 200) / 2
        floors: 8,
      });
      expect(result.technical).toMatchObject({
        carWidthMm: 1100,
        carDepthMm: 1400,
        carHeightMm: 2400,
        shaftWidthMm: 1600,
        shaftDepthMm: 1850,
        pitDepthMm: null,
        motorPowerKw: null,
      });
      expect(result.notes).toEqual([]);
      // 7,000,000 + (8-10)×80,000 + 0
      expect(result.pricing.totalPrice).toBe('6840000.00');
    });

    it('takes the speed band from the floors', async () => {
      expect((await standard({ floors: 12 })).input.speedMs).toBe(1.5);
      expect((await standard({ floors: 18 })).input.speedMs).toBe(1.75);
      expect((await standard({ floors: 25 })).input.speedMs).toBe(2.0);
      expect((await standard({ floors: 30 })).input.speedMs).toBe(2.0);
    });

    it("caps the speed at the lift's maximum and says so", async () => {
      const result = await standard({
        shaftWidthMm: 1500,
        shaftDepthMm: 1500,
        floors: 30,
      });
      expect(result.technical.capacityPersons).toBe(6);
      expect(result.input.speedMs).toBe(1.75);
      expect(result.notes).toContainEqual(
        expect.stringMatching(/maximum is 1.75/),
      );
    });

    it("gives a shaft that only the load's range holds the load's standard car, and says so", async () => {
      // 1000 kg by area. Neither 1000 kg standard shaft fits
      // 2000 × 2200; the 1960 × 2000 start of its range does.
      const result = await standard({ shaftWidthMm: 2000, shaftDepthMm: 2200 });
      expect(result.technical.capacityPersons).toBe(13);
      expect(result.input.capacityKg).toBe(1000);
      expect(result.input.doorWidthMm).toBe(900); // (2000 - 200) / 2
      expect(result.notes[0]).toMatch(
        /nearest standard lift is the 13-person 1000 kg \(1960 × 2000 to 2200 × 2200 mm shaft range\), its load's standard car to be confirmed/,
      );
      // A range gives no car: its load's standard one stays (client, 2026-11-04).
      expect(result.technical.carWidthMm).toBe(1600);
      expect(result.technical.carDepthMm).toBe(1400);
      // The spec sheet says the building's shaft, and names the range beside it.
      expect(result.technical.shaftWidthMm).toBe(2000);
      expect(result.technical.shaftDepthMm).toBe(2200);
      expect(result.technical.standardLift).toBe(
        '13-person lift, 1960 × 2000 to 2200 × 2200 mm shaft range',
      );
    });

    describe('door, from the shaft width (client, 2026-11-06)', () => {
      const door = async (shaftWidthMm: number, shaftDepthMm = 2000) => {
        const { input } = await standard({ shaftWidthMm, shaftDepthMm });
        return [input.doorType, input.doorWidthMm];
      };

      it('makes a shaft above 1.55 m centre opening, (W - 200) / 2 wide', async () => {
        expect(await door(2200)).toEqual(['CENTER_OPEN', 1000]);
        expect(await door(1650)).toEqual(['CENTER_OPEN', 725]);
        expect(await door(2700)).toEqual(['CENTER_OPEN', 1250]);
      });

      it('takes a whole millimetre, rounding down so the opening still fits', async () => {
        expect(await door(1835)).toEqual(['CENTER_OPEN', 817]);
      });

      it('makes a shaft of 1.55 m or less side opening, with the table door', async () => {
        expect(await door(1550, 1600)).toEqual(['SWING', 800]);
        expect(await door(1500, 1500)).toEqual(['SWING', 700]);
        expect(await door(1400, 1800)).toEqual(['SWING', 800]);
        expect(await door(1200, 1200)).toEqual(['SWING', 600]);
      });

      it('starts centre opening one millimetre above 1.55 m, even below the 700 mm a typed door needs', async () => {
        expect(await door(1551, 1600)).toEqual(['CENTER_OPEN', 675]);
      });

      it("overrides the table's side-opening rows above 1.55 m", async () => {
        expect(selectPassengerLift(1650, 1850).lift.door).toBe('2S');
        expect(await door(1650, 1850)).toEqual(['CENTER_OPEN', 725]);
      });

      it('says so when the formula gives a door wider than the car', async () => {
        const result = await standard({
          shaftWidthMm: 2200,
          shaftDepthMm: 1750,
          carWidthMmOverride: 900,
          carDepthMmOverride: 1400,
        });
        expect(result.input.doorWidthMm).toBe(1000);
        expect(result.notes.join(' ')).toMatch(
          /1000 mm door is wider than the 900 mm car/,
        );
      });
    });

    it('prefers a standard row to a shaft range of the same load', () => {
      // 1650 × 1850 holds the 8-person 2S's 1600 × 1850 and the 630 kg range's 1600 × 1600.
      expect(selectPassengerLift(1650, 1850).lift).toMatchObject({
        loadKg: 630,
        door: '2S',
        carWidthMm: 1100,
        range: null,
      });
    });

    it("never picks a row whose shaft is wider or deeper than the one entered, unless none of that load's fits", () => {
      const misfits: string[] = [];
      const wrongFlag: string[] = [];
      for (let width = 1000; width <= 3500; width += 50) {
        for (let depth = 1000; depth <= 3500; depth += 50) {
          const picked = selectPassengerLift(width, depth);
          const anyFits = [...PASSENGER_LIFTS, ...PASSENGER_SHAFT_RANGES].some(
            (lift) =>
              lift.loadKg === picked.lift.loadKg &&
              lift.shaftWidthMm <= width &&
              lift.shaftDepthMm <= depth,
          );
          if (picked.undersized === anyFits) {
            wrongFlag.push(`${width} × ${depth}`);
          }
          if (
            !picked.undersized &&
            (picked.lift.shaftWidthMm > width ||
              picked.lift.shaftDepthMm > depth)
          ) {
            misfits.push(`${width} × ${depth}`);
          }
        }
      }
      expect(misfits).toEqual([]);
      expect(wrongFlag).toEqual([]);
    });

    it("never gives a shaft a car that does not fit inside it while another row of its load has one that does", () => {
      const carFits = (
        lift: { carWidthMm: number | null; carDepthMm: number | null },
        width: number,
        depth: number,
      ) =>
        lift.carWidthMm === null ||
        (lift.carWidthMm < width && lift.carDepthMm! < depth);
      const avoidable: string[] = [];
      const unflagged: string[] = [];
      for (let width = 1000; width <= 4200; width += 25) {
        for (let depth = 1000; depth <= 4200; depth += 25) {
          const { lift, undersized } = selectPassengerLift(width, depth);
          if (carFits(lift, width, depth)) continue;
          if (!undersized) unflagged.push(`${width} × ${depth}`);
          const another = [...PASSENGER_LIFTS, ...PASSENGER_SHAFT_RANGES].some(
            (row) => row.loadKg === lift.loadKg && carFits(row, width, depth),
          );
          if (another) avoidable.push(`${width} × ${depth}`);
        }
      }
      expect(avoidable).toEqual([]);
      expect(unflagged).toEqual([]);
    });

    it('takes the row whose car fits when no shaft of the load does', () => {
      // 1000 kg by area: neither 1000 kg shaft fits, the 1100 × 2100 car does.
      expect(selectPassengerLift(1500, 3000)).toMatchObject({
        undersized: true,
        lift: { loadKg: 1000, carWidthMm: 1100, carDepthMm: 2100 },
      });
      // 1600 kg by area: not the 2100 × 1600 car, wider than the shaft.
      expect(selectPassengerLift(2000, 3700)).toMatchObject({
        undersized: true,
        lift: { loadKg: 1600, carWidthMm: 1750, carDepthMm: 2000 },
      });
    });

    it('says so when no car of the load fits the shaft', async () => {
      const result = await standard({ shaftWidthMm: 1000, shaftDepthMm: 3500 });
      expect(result.notes).toContainEqual(
        expect.stringMatching(
          /A 1350 × 1400 mm car does not fit a 1000 × 3500 mm shaft; to be confirmed/,
        ),
      );
    });

    it("flags a standard shaft the formula gives a load it cannot hold", () => {
      // The 5-person 400 kg shaft: 544 kg by area, 630 kg, and 1450 mm deep.
      expect(selectPassengerLift(1650, 1450)).toMatchObject({
        exact: false,
        undersized: true,
        lift: { loadKg: 630 },
      });
    });

    it('fits either shape of a range that narrows as it widens', () => {
      // 1800 kg by area; 3500 × 2350 holds 3000 × 2300 but not 2800 × 2400.
      expect(selectPassengerLift(3500, 2350)).toMatchObject({
        undersized: false,
        lift: { loadKg: 1800, shaftWidthMm: 3000, shaftDepthMm: 2300 },
      });
    });

    it('takes a standard row over its range, then the bigger shaft', () => {
      expect(selectPassengerLift(2200, 2000).lift).toMatchObject({
        loadKg: 1000,
        range: null,
        shaftWidthMm: 2200,
      });
      expect(selectPassengerLift(2850, 2500).lift).toMatchObject({
        loadKg: 1600,
        carWidthMm: 1750,
        carDepthMm: 2000,
      });
    });

    it('keeps the standard table for car and speed on every load it has', () => {
      for (const row of PASSENGER_SHAFT_RANGES) {
        const first = PASSENGER_LIFTS.find((lift) => lift.loadKg === row.loadKg);
        expect(row.carWidthMm).toBe(first?.carWidthMm ?? null);
        expect(row.carDepthMm).toBe(first?.carDepthMm ?? null);
        if (first) {
          expect(row.maxSpeedMs).toBe(first.maxSpeedMs);
        }
      }
    });

    it('prints the same overhead on every lift, and none on an escalator', async () => {
      const passenger = await standard({ shaftWidthMm: 3700, shaftDepthMm: 3100 });
      expect(passenger.technical.overheadClearanceMm).toBe(4500);
      const carLift = await calc({
        ...WORKED_EXAMPLE,
        ...forProduct('CAR_PLATFORM_LIFT'),
        productType: 'CAR_PLATFORM_LIFT',
        capacityKg: 3500,
      });
      expect(carLift.technical.overheadClearanceMm).toBe(4500);
      const escalator = await calc({
        ...WORKED_EXAMPLE,
        ...forProduct('ESCALATOR'),
        productType: 'ESCALATOR',
      });
      expect(escalator.technical.overheadClearanceMm).toBeNull();
    });

    it('stops at the heaviest load for a shaft bigger than every range, and says it is bigger', async () => {
      const result = await standard({
        shaftWidthMm: 5000,
        shaftDepthMm: 5000,
        floors: 30,
      });
      expect(result.technical.capacityPersons).toBe(40);
      expect(result.input.capacityKg).toBe(3000);
      // No standard car at 3000 kg, and the standard table's top speed.
      expect(result.technical.carWidthMm).toBeNull();
      expect(result.notes[0]).toMatch(/its car size to be confirmed/);
      expect(result.input.speedMs).toBe(2.0);
      expect(result.notes).toContainEqual(
        expect.stringMatching(
          /bigger than the 3500 × 3000 to 4000 × 3300 mm range for 3000 kg/,
        ),
      );
      // Inside its range, no such note.
      const inside = await standard({ shaftWidthMm: 1250, shaftDepthMm: 1250 });
      expect(inside.input.capacityKg).toBe(320);
      expect(inside.notes.join(' ')).not.toMatch(/bigger than/);
    });

    it('never gives a shaft at least as big in both dimensions a lighter lift', () => {
      const lighter: string[] = [];
      for (let width = 1000; width <= 4200; width += 25) {
        for (let depth = 1000; depth <= 3500; depth += 25) {
          const here = selectPassengerLift(width, depth).lift.loadKg;
          const wider = selectPassengerLift(width + 25, depth).lift.loadKg;
          const deeper = selectPassengerLift(width, depth + 25).lift.loadKg;
          if (wider < here || deeper < here) {
            lighter.push(`${width} × ${depth}`);
          }
        }
      }
      expect(lighter).toEqual([]);
    });

    it('quotes a shaft too small for the lightest lift as that lift, and says so', async () => {
      // A 1500 × 1500 hospital shaft (client, 2026-10-23) is the shaft
      // ranges' own 450 kg row (client, 2026-11-03).
      const hospital = await standard({
        productType: 'HOSPITAL',
        shaftWidthMm: 1500,
        shaftDepthMm: 1500,
        floors: 12,
      });
      expect(hospital.technical.capacityPersons).toBe(6);
      expect(hospital.input.capacityKg).toBe(450);
      // Below the 320 kg range's 1200 × 1200 it is quoted, not refused, down
      // to the 1000 × 1000 the form allows.
      const result = await standard({
        shaftWidthMm: 1100,
        shaftDepthMm: 1100,
        floors: 12,
      });
      expect(result.technical.capacityPersons).toBe(4);
      expect(result.input.capacityKg).toBe(320);
      // Not in the standard table, so it keeps the limit of its nearest load, 1.75 m/s.
      expect(result.input.speedMs).toBe(1.5);
      expect(result.notes[0]).toMatch(
        /1100 × 1100 mm works out at 3\.7 persons, 275 kg, but no shaft for the 4-person 320 kg fits.*manufacturer/,
      );
      const smallest = await standard({ shaftWidthMm: 1000, shaftDepthMm: 1000 });
      expect(smallest.technical.capacityPersons).toBe(4);
    });

    it('gives every standard lift the persons its rated load carries (load ÷ 75, rounded down)', () => {
      const wrong = [...PASSENGER_LIFTS, ...PASSENGER_SHAFT_RANGES].filter(
        (lift) => lift.persons !== Math.floor(lift.loadKg / 75),
      ).map((lift) => `${lift.persons} persons at ${lift.loadKg} kg`);
      expect(wrong).toEqual([]);
    });

    // The client edits the load or the persons on the specification (2026-10-29).
    it("prints a typed rated load in place of the table's, and prices the lift the shaft names", async () => {
      const result = await standard({ capacityKgOverride: 800 });
      expect(result.input).toMatchObject({
        capacityKg: 800,
        capacityKgOverride: 800,
      });
      expect(result.technical.capacityPersons).toBe(10);
      // The shaft still picks the machine: the 8-person's car, named by its
      // shaft so no head count contradicts the typed one, and the door.
      expect(result.input.doorWidthMm).toBe(700);
      expect(result.technical.standardLift).toBe(
        '1600 × 1850 mm standard shaft',
      );
      // The 8-person 630 kg lift's price, 7,000,000 + (8-10)×80,000: a typed
      // load is not a price change — that is the Price step, and its
      // sign-off (security review, 2026-10-29).
      expect(result.pricing.totalPrice).toBe('6840000.00');
      expect(result.notes).toEqual([
        expect.stringMatching(
          /Rated load typed as 800 kg; the standard lift for this shaft is the 8-person 630 kg, and it is priced as that lift/,
        ),
      ]);
      const lower = await standard({ capacityKgOverride: 320 });
      expect(lower.pricing.totalPrice).toBe('6840000.00');
    });

    it("says nothing of typed figures that are the table's own, and keeps its name", async () => {
      const load = await standard({ capacityKgOverride: 630 });
      expect(load.notes).toEqual([]);
      expect(load.technical.standardLift).toBe(
        '8-person lift, 1600 × 1850 mm standard shaft',
      );
      expect(
        (await standard({ capacityPersonsOverride: 8 })).technical.standardLift,
      ).toBe('8-person lift, 1600 × 1850 mm standard shaft');
    });

    describe('a typed speed and car (client, 2026-11-05)', () => {
      it('prints a typed speed at the same price, and says what the table gives', async () => {
        const blank = await standard({});
        const typed = await standard({ speedMsOverride: 1.6 });
        expect(typed.input).toMatchObject({
          speedMs: 1.6,
          speedMsOverride: 1.6,
        });
        expect(typed.pricing).toEqual(blank.pricing);
        expect(typed.notes).toContain(
          `Speed typed as 1.6 m/s; the table gives this lift ${blank.input.speedMs} m/s. The list price stays the same.`,
        );
      });

      it("says nothing of a typed speed that is the table's own, and a null is the table's", async () => {
        const blank = await standard({});
        const same = await standard({ speedMsOverride: blank.input.speedMs });
        expect(same.notes).toEqual([]);
        const cleared = await standard({ speedMsOverride: null });
        expect(cleared.input.speedMs).toBe(blank.input.speedMs);
        expect(cleared.notes).toEqual([]);
      });

      it("keeps the cap note when the typed speed is the capped table figure itself", async () => {
        const typed = await standard({
          shaftWidthMm: 1500,
          shaftDepthMm: 1500,
          floors: 22,
          speedMsOverride: 1.75,
        });
        expect(typed.notes.join(' ')).toContain(
          '22 floors call for 2 m/s; this lift\'s maximum is 1.75 m/s',
        );
      });

      it('does not call a typed speed capped: nothing capped it', async () => {
        const typed = await standard({
          shaftWidthMm: 1500,
          shaftDepthMm: 1500,
          floors: 30,
          speedMsOverride: 2.5,
        });
        expect(typed.input.speedMs).toBe(2.5);
        expect(typed.notes.join(' ')).not.toContain('so that is what is quoted');
      });

      it('prints a typed car at the same price, and says what the table gives', async () => {
        const blank = await standard({});
        const typed = await standard({
          carWidthMmOverride: 1200,
          carDepthMmOverride: 1500,
          carHeightMmOverride: 2300,
        });
        expect(typed.technical).toMatchObject({
          carWidthMm: 1200,
          carDepthMm: 1500,
          carHeightMm: 2300,
        });
        expect(typed.input).toMatchObject({
          carWidthMmOverride: 1200,
          carDepthMmOverride: 1500,
          carHeightMmOverride: 2300,
        });
        expect(typed.pricing).toEqual(blank.pricing);
        expect(typed.notes).toContain(
          "Car typed as 1200 × 1500 × 2300 mm; the table's is 1100 × 1400 × 2400 mm. The list price stays the same.",
        );
      });

      it("keeps the table's figure for what was not typed", async () => {
        const typed = await standard({ carHeightMmOverride: 2300 });
        expect(typed.technical).toMatchObject({
          carWidthMm: 1100,
          carDepthMm: 1400,
          carHeightMm: 2300,
        });
      });

      it('fills in a car the table does not have', async () => {
        const typed = await standard({
          shaftWidthMm: 3700,
          shaftDepthMm: 3100,
          floors: 12,
          carWidthMmOverride: 2500,
          carDepthMmOverride: 2300,
        });
        expect(typed.technical).toMatchObject({
          carWidthMm: 2500,
          carDepthMm: 2300,
          carHeightMm: 2400,
        });
        expect(typed.notes).toContain(
          "Car typed as 2500 × 2300 × 2400 mm; the table's is still to be confirmed. The list price stays the same.",
        );
      });

      it('says when a typed car does not fit its shaft, and quotes it all the same', async () => {
        const wide = await standard({ carWidthMmOverride: 1600 });
        expect(wide.technical.carWidthMm).toBe(1600);
        expect(wide.notes).toContain(
          "A 1600 × 1400 mm car does not fit a 1600 × 1850 mm shaft; to be confirmed by the manufacturer's drawing.",
        );
        const fits = await standard({ carWidthMmOverride: 1200 });
        expect(fits.notes.join(' ')).not.toContain('does not fit');
      });

      it('does not ask to confirm the standard car once a car is typed', async () => {
        const table = await standard({ shaftWidthMm: 2000, shaftDepthMm: 2200 });
        expect(table.notes[0]).toContain("its load's standard car to be confirmed");
        const typed = await standard({
          shaftWidthMm: 2000,
          shaftDepthMm: 2200,
          carWidthMmOverride: 1500,
          carDepthMmOverride: 1500,
        });
        expect(typed.notes[0]).not.toContain('standard car');
      });

      it('refuses a height with no car to go on: it would not print anywhere', async () => {
        await expect(
          standard({
            shaftWidthMm: 3700,
            shaftDepthMm: 3100,
            floors: 12,
            carHeightMmOverride: 2500,
          }),
        ).rejects.toThrow(
          'The table has no car for 2500 kg: type its width and depth together.',
        );
      });

      it('refuses half a car where the table has none: it would print "2,500 × — × 2,400"', async () => {
        await expect(
          standard({
            shaftWidthMm: 3700,
            shaftDepthMm: 3100,
            floors: 12,
            carWidthMmOverride: 2500,
          }),
        ).rejects.toThrow(
          'The table has no car for 2500 kg: type its width and depth together.',
        );
      });

      it('takes neither on a car lift, which has its own speed and platform', async () => {
        const result = await service.calculateSpecs(TENANT_ID, {
          productType: 'CAR_LIFT',
          shaftWidthMm: 3400,
          shaftDepthMm: 6500,
          capacityKg: 3500,
          stops: 2,
          speedMs: 0.5,
          doorType: 'CENTER_OPEN',
          doorWidthMm: 2600,
          marginPercent: 0,
          taxPercent: 0,
          speedMsOverride: 0.3,
          carWidthMmOverride: 9000,
        });
        expect(result.input.speedMs).toBe(0.5);
        expect(result.input).not.toHaveProperty('speedMsOverride');
        expect(result.input).not.toHaveProperty('carWidthMmOverride');
        expect(result.technical.carWidthMm).not.toBe(9000);
      });
    });

    it('prints typed persons without touching the load or the price', async () => {
      const result = await standard({ capacityPersonsOverride: 7 });
      expect(result.technical.capacityPersons).toBe(7);
      expect(result.input).toMatchObject({
        capacityKg: 630,
        capacityPersonsOverride: 7,
      });
      expect(result.technical.standardLift).toBe(
        '1600 × 1850 mm standard shaft',
      );
      expect(result.pricing.totalPrice).toBe('6840000.00');
      expect(result.notes).toEqual([]);

      const both = await standard({
        capacityKgOverride: 1000,
        capacityPersonsOverride: 12,
      });
      expect(both.technical.capacityPersons).toBe(12);
      expect(both.input.capacityKg).toBe(1000);
    });

    it('says so when the persons typed are more than the load carries', async () => {
      const result = await standard({ capacityPersonsOverride: 13 });
      expect(result.notes).toEqual([
        expect.stringMatching(/13 persons is more than 630 kg carries.*\(8\)/),
      ]);
    });

    it('goes back to the table when a typed figure is cleared', async () => {
      const result = await standard({
        capacityKgOverride: null,
        capacityPersonsOverride: null,
      });
      expect(result.technical.capacityPersons).toBe(8);
      expect(result.input.capacityKg).toBe(630);
      expect(result.input).not.toHaveProperty('capacityKgOverride');
      expect(result.input).not.toHaveProperty('capacityPersonsOverride');
      expect(result.technical.standardLift).toBe(
        '8-person lift, 1600 × 1850 mm standard shaft',
      );
    });

    it('still wants every figure for a product outside the table', async () => {
      await expect(
        service.calculateSpecs(TENANT_ID, {
          productType: 'CARGO',
          marginPercent: 0,
          taxPercent: 0,
        }),
      ).rejects.toThrow(/capacityKg/);
    });
  });

  it('counts persons as load ÷ 75 rounded down when every figure is given', async () => {
    const result = await calc({ ...WORKED_EXAMPLE, capacityKg: 800 });
    expect(result.technical.capacityPersons).toBe(10);
  });

  it('prints typed persons on every product with a rated load, and only there', async () => {
    const classic = await calc({ ...WORKED_EXAMPLE, capacityPersonsOverride: 12 });
    expect(classic.technical.capacityPersons).toBe(12);
    expect(classic.technical.carWidthMm).toBe(1100);

    const vehicle = (productType: string, extra: Partial<CalcRequest>) =>
      calc({
        ...WORKED_EXAMPLE,
        ...forProduct(productType),
        productType,
        capacityKg: 3500,
        stops: 2,
        ...extra,
      });
    expect(
      (await vehicle('CAR_LIFT', { capacityPersonsOverride: 2 })).technical
        .capacityPersons,
    ).toBe(2);
    expect(
      (await vehicle('CAR_LIFT', {})).technical.capacityPersons,
    ).toBeNull();
    // An escalator carries people on steps, not a rated load.
    expect(
      (await vehicle('ESCALATOR', { capacityPersonsOverride: 2 })).technical
        .capacityPersons,
    ).toBeNull();
  });

  it("types a lift's load in its capacity outside the table, so the table's override is not kept", async () => {
    const result = await calc({ ...WORKED_EXAMPLE, capacityKgOverride: 800 });
    expect(result.input.capacityKg).toBe(1000);
    expect(result.input).not.toHaveProperty('capacityKgOverride');
  });
});
